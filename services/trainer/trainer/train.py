"""LoRA supervised fine-tuning of one job (transformers + peft + trl)."""

from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path
from typing import Any

import torch
from datasets import Dataset
from huggingface_hub import HfApi
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainerCallback
from trl import SFTConfig, SFTTrainer

from .card import model_card
from .data import download_jsonl, split_records, to_training_rows
from .reporter import EventReporter, JobInactiveError
from .settings import Settings
from .spec import TrainingSpec

logger = logging.getLogger(__name__)


class ProgressCallback(TrainerCallback):
    """Streams loss / learning-rate points to the web app and honours cancellation."""

    def __init__(self, reporter: EventReporter) -> None:
        self.reporter = reporter
        self.cancelled = False

    def _send(self, action, control) -> None:
        try:
            action()
        except JobInactiveError:
            self.cancelled = True
            control.should_training_stop = True

    def on_log(self, args, state, control, logs=None, **kwargs):
        logs = logs or {}
        if "loss" not in logs and "eval_loss" not in logs:
            return
        self._send(
            lambda: self.reporter.metric(
                step=state.global_step,
                total_steps=state.max_steps,
                epoch=state.epoch or 0.0,
                train_loss=logs.get("loss"),
                eval_loss=logs.get("eval_loss"),
                learning_rate=logs.get("learning_rate"),
            ),
            control,
        )

    def on_epoch_end(self, args, state, control, **kwargs):
        epoch = round(state.epoch or 0)
        total = int(args.num_train_epochs)
        self._send(lambda: self.reporter.log(f"Epoch {epoch}/{total} terminée"), control)


def _device_setup() -> dict[str, Any]:
    if torch.cuda.is_available():
        bf16 = torch.cuda.is_bf16_supported()
        return {
            "device": f"GPU {torch.cuda.get_device_name(0)}",
            "dtype": torch.bfloat16 if bf16 else torch.float16,
            "bf16": bf16,
            "fp16": not bf16,
            "gpu": True,
        }
    return {"device": "CPU", "dtype": torch.float32, "bf16": False, "fp16": False, "gpu": False}


def _thousands(value: int) -> str:
    """French digit grouping: 1234567 → "1 234 567"."""
    return f"{value:,}".replace(",", " ")


def _last_eval_loss(log_history: list[dict[str, Any]]) -> float | None:
    for entry in reversed(log_history):
        if "eval_loss" in entry:
            return float(entry["eval_loss"])
    return None


def run_training(
    spec: TrainingSpec,
    reporter: EventReporter,
    *,
    hf_token: str | None,
    settings: Settings,
    model_source: str | None = None,
) -> dict[str, Any]:
    """Trains the adapter, publishes it and returns the result reported to the web app.

    `model_source` overrides where weights are loaded from (tests use a local tiny model).
    """
    started = time.monotonic()
    hp = spec.hyperparameters
    workdir = Path(settings.workdir) / spec.job_id
    shutil.rmtree(workdir, ignore_errors=True)
    workdir.mkdir(parents=True)

    records = download_jsonl(spec.dataset.url)
    train_records, eval_records = split_records(records, spec.dataset.sample_count)
    supports_system = spec.base_model.supports_system_prompt
    train_rows = to_training_rows(train_records, spec.dataset.format, supports_system)
    eval_rows = to_training_rows(eval_records, spec.dataset.format, supports_system)
    if not train_rows:
        raise ValueError("Le dataset ne contient aucun exemple exploitable pour l'entraînement.")
    reporter.log(
        f"Dataset : {len(train_records)} exemples d'entraînement ({len(train_rows)} séquences), "
        f"{len(eval_records)} d'évaluation"
    )

    setup = _device_setup()
    source = model_source or spec.base_model.id
    reporter.log(f"Chargement du modèle {spec.base_model.id} ({setup['device']})")
    tokenizer = AutoTokenizer.from_pretrained(source, token=hf_token)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(source, token=hf_token, dtype=setup["dtype"])

    peft_config = LoraConfig(
        r=hp.lora_rank,
        lora_alpha=hp.lora_alpha,
        lora_dropout=hp.lora_dropout,
        target_modules=hp.target_modules,
        task_type="CAUSAL_LM",
    )
    args = SFTConfig(
        output_dir=str(workdir / "checkpoints"),
        num_train_epochs=hp.epochs,
        per_device_train_batch_size=hp.batch_size,
        per_device_eval_batch_size=hp.batch_size,
        gradient_accumulation_steps=hp.gradient_accumulation_steps,
        learning_rate=hp.learning_rate,
        warmup_steps=hp.warmup_ratio,  # a float < 1 is a ratio of the total steps
        lr_scheduler_type="cosine",
        max_length=hp.max_seq_length,
        logging_steps=0.01,  # ~100 points on the loss curve, whatever the run length
        eval_strategy="epoch" if eval_rows else "no",
        save_strategy="no",
        report_to="none",
        bf16=setup["bf16"],
        fp16=setup["fp16"],
        use_cpu=not setup["gpu"],
        gradient_checkpointing=setup["gpu"],
        gradient_checkpointing_kwargs={"use_reentrant": False} if setup["gpu"] else None,
        auto_find_batch_size=setup["gpu"],
        disable_tqdm=True,
        seed=42,
    )
    callback = ProgressCallback(reporter)
    trainer = SFTTrainer(
        model=model,
        args=args,
        train_dataset=Dataset.from_list(train_rows),
        eval_dataset=Dataset.from_list(eval_rows) if eval_rows else None,
        processing_class=tokenizer,
        peft_config=peft_config,
        callbacks=[callback],
    )

    trainable, total = trainer.model.get_nb_trainable_parameters()
    share = f"{trainable / total * 100:.2f}".replace(".", ",")
    reporter.log(
        f"LoRA r={hp.lora_rank}, alpha={hp.lora_alpha} : "
        f"{_thousands(trainable)} paramètres entraînables ({share} % du modèle)"
    )
    reporter.status("training", "Entraînement en cours")
    output = trainer.train()
    if callback.cancelled:
        raise JobInactiveError("job cancelled during training")

    train_loss = float(output.training_loss)
    eval_loss = _last_eval_loss(trainer.state.log_history)

    reporter.status("uploading", "Publication de l'adapter LoRA")
    adapter_dir = workdir / "adapter"
    trainer.model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)
    (adapter_dir / "README.md").write_text(
        model_card(spec, train_loss=train_loss, eval_loss=eval_loss), encoding="utf-8"
    )

    if settings.skip_upload:
        reporter.log(
            f"Publication désactivée (FTF_SKIP_UPLOAD) : adapter conservé dans {adapter_dir}"
        )
    else:
        api = HfApi(token=hf_token)
        api.create_repo(spec.output.repo_id, private=spec.output.private, exist_ok=True)
        api.upload_folder(
            repo_id=spec.output.repo_id,
            folder_path=str(adapter_dir),
            commit_message=f"FineTuneForge: {spec.output.job_name}",
        )
        reporter.log(f"Adapter publié sur {spec.output.repo_id}")

    return {
        "repoId": spec.output.repo_id,
        "trainLoss": train_loss,
        "evalLoss": eval_loss,
        "runtimeSeconds": round(time.monotonic() - started, 1),
    }
