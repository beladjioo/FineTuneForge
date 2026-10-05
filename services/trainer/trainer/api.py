"""HTTP API used by the web app's training provider (same contract locally and on Modal).

  POST /jobs                 {spec, gpu}  → {runId}
  GET  /jobs/{runId}                      → {status: running | finished | failed | unknown}
  POST /jobs/{runId}/cancel               → {cancelled: true}
  GET  /health
All routes but /health require `Authorization: Bearer $TRAINER_API_SECRET`.
"""

from __future__ import annotations

import hmac
from collections.abc import Callable
from typing import Literal, Protocol

from fastapi import Depends, FastAPI, Header, HTTPException

from .spec import TRAINER_CONTRACT_VERSION, StartJobRequest

RunStatus = Literal["running", "finished", "failed", "unknown"]


class JobBackend(Protocol):
    def start(self, request: StartJobRequest) -> str: ...
    def status(self, run_id: str) -> RunStatus: ...
    def cancel(self, run_id: str) -> bool: ...


def create_api(backend: JobBackend, api_secret: Callable[[], str], title: str) -> FastAPI:
    app = FastAPI(title=title, docs_url=None, redoc_url=None)

    def require_auth(authorization: str | None = Header(default=None)) -> None:
        secret = api_secret()
        expected = f"Bearer {secret}"
        if not secret or not hmac.compare_digest((authorization or "").encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/health")
    def health() -> dict[str, object]:
        return {"ok": True, "contractVersion": TRAINER_CONTRACT_VERSION}

    @app.post("/jobs", dependencies=[Depends(require_auth)])
    def start(request: StartJobRequest) -> dict[str, str]:
        return {"runId": backend.start(request)}

    @app.get("/jobs/{run_id}", dependencies=[Depends(require_auth)])
    def status(run_id: str) -> dict[str, str]:
        result = backend.status(run_id)
        if result == "unknown":
            raise HTTPException(status_code=404, detail="unknown run")
        return {"status": result}

    @app.post("/jobs/{run_id}/cancel", dependencies=[Depends(require_auth)])
    def cancel(run_id: str) -> dict[str, bool]:
        if not backend.cancel(run_id):
            raise HTTPException(status_code=404, detail="unknown run")
        return {"cancelled": True}

    return app
