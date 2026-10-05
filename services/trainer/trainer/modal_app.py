"""Production GPU workers on Modal (TRAINING_PROVIDER=modal).

Deploy (from services/trainer):
    modal secret create finetuneforge-trainer TRAINER_API_SECRET=... TRAINER_CALLBACK_SECRET=...
    modal deploy trainer/modal_app.py
Then set TRAINER_URL in the web app to the printed `web` endpoint URL.

One function per GPU class (Modal attaches hardware at definition time); the web
app picks the class from the model catalog. Model weights are cached on a Volume.
"""

from __future__ import annotations

import modal
import modal.exception

from trainer.api import RunStatus, create_api
from trainer.spec import StartJobRequest

app = modal.App("finetuneforge-trainer")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "torch>=2.4",
        "transformers>=5.0",
        "peft>=0.17",
        "trl>=1.0",
        "datasets>=3.0",
        "accelerate>=1.0",
        "huggingface_hub>=0.34",
        "httpx>=0.27",
        "pydantic>=2.7",
        "fastapi>=0.115",
    )
    .env({"HF_HOME": "/cache/huggingface", "FTF_WORKDIR": "/tmp/finetuneforge"})
    .add_local_python_source("trainer")
)

secrets = [modal.Secret.from_name("finetuneforge-trainer")]
hf_cache = modal.Volume.from_name("finetuneforge-hf-cache", create_if_missing=True)
gpu_options = {
    "image": image,
    "secrets": secrets,
    "volumes": {"/cache": hf_cache},
    "timeout": 8 * 60 * 60,
    # The web app never re-dispatches automatically: a failed run is reported, not retried.
    "retries": 0,
}


def _run(spec_json: str) -> None:
    import logging

    from trainer.runner import run_job
    from trainer.settings import Settings
    from trainer.spec import TrainingSpec

    logging.basicConfig(level=logging.INFO)
    run_job(TrainingSpec.model_validate_json(spec_json), Settings.from_env())


@app.function(gpu="L4", **gpu_options)
def train_l4(spec_json: str) -> None:
    _run(spec_json)


@app.function(gpu="A10G", **gpu_options)
def train_a10g(spec_json: str) -> None:
    _run(spec_json)


@app.function(gpu="L40S", **gpu_options)
def train_l40s(spec_json: str) -> None:
    _run(spec_json)


@app.function(gpu="A100-80GB", **gpu_options)
def train_a100_80gb(spec_json: str) -> None:
    _run(spec_json)


TRAIN_FUNCTIONS = {
    "L4": train_l4,
    "A10G": train_a10g,
    "L40S": train_l40s,
    "A100-80GB": train_a100_80gb,
}


class ModalBackend:
    def start(self, request: StartJobRequest) -> str:
        call = TRAIN_FUNCTIONS[request.gpu].spawn(request.spec.model_dump_json(by_alias=True))
        return call.object_id

    def _call(self, run_id: str) -> modal.FunctionCall | None:
        try:
            return modal.FunctionCall.from_id(run_id)
        except modal.exception.NotFoundError:
            return None

    def status(self, run_id: str) -> RunStatus:
        call = self._call(run_id)
        if call is None:
            return "unknown"
        try:
            call.get(timeout=0)
            return "finished"
        except (TimeoutError, modal.exception.TimeoutError):
            return "running"
        except modal.exception.OutputExpiredError:
            return "unknown"
        except Exception:
            return "failed"

    def cancel(self, run_id: str) -> bool:
        call = self._call(run_id)
        if call is None:
            return False
        call.cancel(terminate_containers=True)
        return True


@app.function(image=image, secrets=secrets)
@modal.asgi_app()
def web():
    import os

    return create_api(
        ModalBackend(),
        api_secret=lambda: os.environ.get("TRAINER_API_SECRET", ""),
        title="FineTuneForge trainer (Modal)",
    )
