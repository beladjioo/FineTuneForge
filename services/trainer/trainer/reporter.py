"""Signed progress callbacks to the web app, with retries and idempotent sequence numbers."""

from __future__ import annotations

import json
import logging
import math
import time
from typing import Any

import httpx

from .signing import SIGNATURE_HEADER, TIMESTAMP_HEADER, sign
from .spec import TrainingSpec

logger = logging.getLogger(__name__)

RETRY_DELAYS_SECONDS = (1, 2, 4, 8, 16)


class JobInactiveError(Exception):
    """The web app says the job is no longer active (cancelled, failed…): stop working."""


class ReporterError(Exception):
    """A callback was rejected for a reason retries cannot fix."""


def _finite(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and math.isfinite(value) else None


class EventReporter:
    def __init__(
        self,
        spec: TrainingSpec,
        callback_secret: str,
        client: httpx.Client | None = None,
        sleep=time.sleep,
    ) -> None:
        self.spec = spec
        self._secret = callback_secret
        self._client = client or httpx.Client(timeout=15)
        self._sleep = sleep
        self._seq = 0

    # -- transport -------------------------------------------------------------------------------

    def _post(self, url: str, payload: dict[str, Any]) -> httpx.Response:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        last_error: Exception | None = None
        for attempt, delay in enumerate((0, *RETRY_DELAYS_SECONDS)):
            if delay:
                self._sleep(delay)
            timestamp = int(time.time())
            headers = {
                "Content-Type": "application/json",
                SIGNATURE_HEADER: sign(body, self._secret, timestamp),
                TIMESTAMP_HEADER: str(timestamp),
            }
            try:
                response = self._client.post(url, content=body, headers=headers)
            except httpx.HTTPError as error:
                last_error = error
                logger.warning("callback attempt %d failed: %s", attempt + 1, error)
                continue
            if response.status_code == 409:
                raise JobInactiveError(response.text)
            if response.status_code >= 500 or response.status_code == 429:
                last_error = ReporterError(f"HTTP {response.status_code}")
                logger.warning("callback attempt %d got HTTP %d", attempt + 1, response.status_code)
                continue
            if response.status_code >= 400:
                raise ReporterError(
                    f"callback rejected with HTTP {response.status_code}: {response.text[:300]}"
                )
            return response
        raise ReporterError(f"callback failed after retries: {last_error}")

    def _event(self, payload: dict[str, Any]) -> None:
        event = {"jobId": self.spec.job_id, "seq": self._seq, **payload}
        self._seq += 1
        self._post(self.spec.callbacks.events_url, event)

    # -- events ----------------------------------------------------------------------------------

    def status(self, status: str, message: str | None = None, result: dict[str, Any] | None = None):
        payload: dict[str, Any] = {"type": "status", "status": status}
        if message:
            payload["message"] = message[:2000]
        if result:
            payload["result"] = {key: value for key, value in result.items() if value is not None}
        self._event(payload)

    def log(self, message: str, level: str = "info") -> None:
        logger.info("[job] %s", message)
        self._event({"type": "log", "level": level, "message": message[:4000]})

    def metric(
        self,
        *,
        step: int,
        total_steps: int,
        epoch: float,
        train_loss: float | None = None,
        eval_loss: float | None = None,
        learning_rate: float | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "type": "metric",
            "step": int(step),
            "totalSteps": max(1, int(total_steps)),
            "epoch": round(_finite(epoch) or 0.0, 4),
        }
        for key, value in (
            ("trainLoss", train_loss),
            ("evalLoss", eval_loss),
            ("learningRate", learning_rate),
        ):
            finite = _finite(value)
            if finite is not None:
                payload[key] = finite
        self._event(payload)

    # -- credentials -----------------------------------------------------------------------------

    def fetch_hf_token(self) -> str:
        """Just-in-time Hugging Face token (never logged, never written to disk)."""
        response = self._post(self.spec.callbacks.credentials_url, {"jobId": self.spec.job_id})
        token = response.json().get("hfToken")
        if not token:
            raise ReporterError("credentials response has no token")
        return token
