from fastapi.testclient import TestClient

from trainer.api import create_api
from trainer.server import LocalProcessBackend

from .conftest import make_spec


class FakeProcess:
    def __init__(self) -> None:
        self.alive = False
        self.exitcode: int | None = None
        self.terminated = False

    def start(self) -> None:
        self.alive = True

    def is_alive(self) -> bool:
        return self.alive

    def terminate(self) -> None:
        self.terminated = True
        self.alive = False
        self.exitcode = -15

    def join(self, timeout=None) -> None:
        pass


def make_client(max_concurrent=1):
    processes: list[FakeProcess] = []

    def launcher(spec_json: str) -> FakeProcess:
        assert '"jobId"' in spec_json
        process = FakeProcess()
        processes.append(process)
        return process

    backend = LocalProcessBackend(launcher=launcher, max_concurrent=max_concurrent)
    app = create_api(backend, api_secret=lambda: "api-secret", title="test")
    return TestClient(app), processes


AUTH = {"Authorization": "Bearer api-secret"}
BODY = {"spec": make_spec().model_dump(by_alias=True), "gpu": "A10G"}


def test_requires_the_api_secret():
    client, _ = make_client()
    assert client.get("/health").status_code == 200
    assert client.post("/jobs", json=BODY).status_code == 401
    assert (
        client.post("/jobs", json=BODY, headers={"Authorization": "Bearer nope"}).status_code == 401
    )


def test_start_is_idempotent_and_reports_status():
    client, processes = make_client()
    first = client.post("/jobs", json=BODY, headers=AUTH)
    second = client.post("/jobs", json=BODY, headers=AUTH)
    assert first.status_code == 200 and first.json() == second.json()
    assert len(processes) == 1

    run_id = first.json()["runId"]
    assert client.get(f"/jobs/{run_id}", headers=AUTH).json() == {"status": "running"}
    processes[0].alive, processes[0].exitcode = False, 0
    assert client.get(f"/jobs/{run_id}", headers=AUTH).json() == {"status": "finished"}
    assert client.get("/jobs/unknown", headers=AUTH).status_code == 404


def test_cancel_terminates_the_process_and_busy_trainer_refuses_new_jobs():
    client, processes = make_client()
    run_id = client.post("/jobs", json=BODY, headers=AUTH).json()["runId"]

    other = {
        **BODY,
        "spec": make_spec(jobId="00000000-0000-4000-8000-000000000001").model_dump(by_alias=True),
    }
    assert client.post("/jobs", json=other, headers=AUTH).status_code == 429

    assert client.post(f"/jobs/{run_id}/cancel", headers=AUTH).json() == {"cancelled": True}
    assert processes[0].terminated
    assert client.get(f"/jobs/{run_id}", headers=AUTH).json() == {"status": "failed"}
    assert client.post("/jobs", json=other, headers=AUTH).status_code == 200


def test_rejects_invalid_specs():
    client, _ = make_client()
    bad = {"spec": {**BODY["spec"], "version": 2}, "gpu": "A10G"}
    assert client.post("/jobs", json=bad, headers=AUTH).status_code == 422
