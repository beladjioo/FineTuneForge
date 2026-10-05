"""Wire contract with the web app (mirror of apps/web/src/features/fine-tuning/contract.ts)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

TRAINER_CONTRACT_VERSION = 1

DatasetFormat = Literal["text", "prompt_completion", "chat"]
GpuType = Literal["L4", "A10G", "L40S", "A100-80GB"]


class _Model(BaseModel):
    """camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class BaseModelRef(_Model):
    id: str
    supports_system_prompt: bool = True


class DatasetRef(_Model):
    url: str
    format: DatasetFormat
    sample_count: int = Field(ge=1)


class LoraHyperparameters(_Model):
    lora_rank: int = Field(ge=1, le=256)
    lora_alpha: int = Field(ge=1, le=512)
    lora_dropout: float = Field(ge=0, le=0.5)
    learning_rate: float = Field(gt=0, le=1e-2)
    epochs: int = Field(ge=1, le=20)
    batch_size: int = Field(ge=1, le=64)
    gradient_accumulation_steps: int = Field(ge=1, le=64)
    max_seq_length: int = Field(ge=64, le=32768)
    warmup_ratio: float = Field(ge=0, lt=1)
    target_modules: list[str] | Literal["all-linear"] = "all-linear"


class OutputRef(_Model):
    repo_id: str
    private: bool = False
    job_name: str


class Callbacks(_Model):
    events_url: str
    credentials_url: str


class TrainingSpec(_Model):
    version: Literal[1]
    job_id: str
    base_model: BaseModelRef
    dataset: DatasetRef
    hyperparameters: LoraHyperparameters
    output: OutputRef
    callbacks: Callbacks


class StartJobRequest(_Model):
    spec: TrainingSpec
    gpu: GpuType = "A10G"


def eval_split_size(sample_count: int) -> int:
    """Shared rule with the web app's estimate (apps/web/.../lib/estimate.ts)."""
    return min(200, round(sample_count * 0.1)) if sample_count >= 50 else 0
