"""Local trainer server (TRAINING_PROVIDER=local).

    cd services/trainer && uvicorn trainer.server:app --port 8000

Each job runs in its own process: cancelling terminates it, which also frees GPU memory.
"""

from __future__ import annotations

import logging
import multiprocessing as mp
import os
import threading
from collections.abc import Callable
from typing import Protocol

from fastapi import HTTPException

from .api import RunStatus, create_api
from .runner import run_job
from .settings import Settings
from .spec import StartJobRequest, TrainingSpec

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


class ProcessLike(Protocol):
    exitcode: int | None

    def start(self) -> None: ...
    def is_alive(self) -> bool: ...
    def terminate(self) -> None: ...
    def join(self, timeout: float | None = None) -> None: ...


def _work(spec_json: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    run_job(TrainingSpec.model_validate_json(spec_json), Settings.from_env())


def spawn_process(spec_json: str) -> ProcessLike:
    return mp.get_context("spawn").Process(target=_work, args=(spec_json,), daemon=False)


class LocalProcessBackend:
    def __init__(
        self,
        launcher: Callable[[str], ProcessLike] = spawn_process,
        max_concurrent: int = 1,
    ) -> None:
        self._launcher = launcher
        self._max_concurrent = max_concurrent
        self._runs: dict[str, ProcessLike] = {}
        self._lock = threading.Lock()

    def start(self, request: StartJobRequest) -> str:
        run_id = f"local-{request.spec.job_id}"
        with self._lock:
            existing = self._runs.get(run_id)
            if existing is not None and existing.is_alive():
                return run_id  # idempotent retry from the web app
            busy = sum(process.is_alive() for process in self._runs.values())
            if busy >= self._max_concurrent:
                raise HTTPException(status_code=429, detail="trainer busy")
            process = self._launcher(request.spec.model_dump_json(by_alias=True))
            process.start()
            self._runs[run_id] = process
        return run_id

    def status(self, run_id: str) -> RunStatus:
        process = self._runs.get(run_id)
        if process is None:
            return "unknown"
        if process.is_alive():
            return "running"
        return "finished" if process.exitcode == 0 else "failed"

    def cancel(self, run_id: str) -> bool:
        process = self._runs.get(run_id)
        if process is None:
            return False
        if process.is_alive():
            process.terminate()
            process.join(timeout=10)
        return True


app = create_api(
    LocalProcessBackend(max_concurrent=int(os.environ.get("FTF_MAX_CONCURRENT_JOBS", "1"))),
    api_secret=lambda: os.environ.get("TRAINER_API_SECRET", ""),
    title="FineTuneForge trainer (local)",
)
