import json

import httpx
import pytest

from trainer.reporter import EventReporter, JobInactiveError, ReporterError
from trainer.signing import sign


def make_reporter(spec, handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return EventReporter(spec, "callback-secret", client=client, sleep=lambda _s: None)


def test_events_are_signed_and_sequenced(spec):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = request.content
        timestamp = int(request.headers["X-FTF-Timestamp"])
        assert request.headers["X-FTF-Signature"] == sign(body, "callback-secret", timestamp)
        seen.append(json.loads(body))
        return httpx.Response(200, json={"ok": True})

    reporter = make_reporter(spec, handler)
    reporter.status("training", "Entraînement en cours")
    reporter.metric(step=3, total_steps=10, epoch=0.3, train_loss=1.25, eval_loss=float("nan"))
    reporter.log("hello")

    assert [event["seq"] for event in seen] == [0, 1, 2]
    assert seen[0]["message"] == "Entraînement en cours"
    assert seen[1] == {
        "jobId": spec.job_id,
        "seq": 1,
        "type": "metric",
        "step": 3,
        "totalSteps": 10,
        "epoch": 0.3,
        "trainLoss": 1.25,
    }


def test_transient_errors_are_retried_with_the_same_sequence(spec):
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(json.loads(request.content)["seq"])
        return httpx.Response(503) if len(attempts) < 3 else httpx.Response(200)

    make_reporter(spec, handler).log("retry me")
    assert attempts == [0, 0, 0]


def test_conflict_means_the_job_is_no_longer_active(spec):
    reporter = make_reporter(spec, lambda _r: httpx.Response(409, json={"error": "job_inactive"}))
    with pytest.raises(JobInactiveError):
        reporter.log("too late")


def test_client_errors_are_not_retried(spec):
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(401)

    with pytest.raises(ReporterError):
        make_reporter(spec, handler).log("bad signature")
    assert len(calls) == 1


def test_fetches_the_hf_token_just_in_time(spec):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/trainer/credentials"
        assert json.loads(request.content) == {"jobId": spec.job_id}
        return httpx.Response(200, json={"hfToken": "hf_secret", "namespace": "alice"})

    assert make_reporter(spec, handler).fetch_hf_token() == "hf_secret"
