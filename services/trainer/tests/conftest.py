from __future__ import annotations

from typing import Any

import pytest

from trainer.reporter import EventReporter
from trainer.spec import TrainingSpec


def make_spec(**overrides: Any) -> TrainingSpec:
    data: dict[str, Any] = {
        "version": 1,
        "jobId": "6f1c2b9e-8f43-4a3e-9d55-2f5b8f6f8a10",
        "baseModel": {"id": "org/tiny-model", "supportsSystemPrompt": True},
        "dataset": {"url": "http://web.test/dataset.jsonl", "format": "chat", "sampleCount": 20},
        "hyperparameters": {
            "loraRank": 8,
            "loraAlpha": 16,
            "loraDropout": 0.05,
            "learningRate": 0.0002,
            "epochs": 1,
            "batchSize": 4,
            "gradientAccumulationSteps": 1,
            "maxSeqLength": 128,
            "warmupRatio": 0.03,
            "targetModules": "all-linear",
        },
        "output": {"repoId": "alice/tiny-bot", "private": False, "jobName": "Tiny bot"},
        "callbacks": {
            "eventsUrl": "http://web.test/api/trainer/events",
            "credentialsUrl": "http://web.test/api/trainer/credentials",
        },
    }
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key] = {**data[key], **value}
        else:
            data[key] = value
    return TrainingSpec.model_validate(data)


class RecordingReporter(EventReporter):
    """Reporter that records events instead of calling the web app."""

    def __init__(self, spec: TrainingSpec, inactive_after: int | None = None) -> None:
        super().__init__(spec, "secret")
        self.events: list[dict[str, Any]] = []
        self.inactive_after = inactive_after

    def _event(self, payload: dict[str, Any]) -> None:
        from trainer.reporter import JobInactiveError

        if self.inactive_after is not None and len(self.events) >= self.inactive_after:
            raise JobInactiveError("cancelled")
        self.events.append(payload)

    def fetch_hf_token(self) -> str:
        return "hf_test_token"


@pytest.fixture
def spec() -> TrainingSpec:
    return make_spec()
