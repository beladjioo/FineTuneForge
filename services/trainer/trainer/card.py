"""Model card (README.md) published with the adapter."""

from __future__ import annotations

from .spec import TrainingSpec


def model_card(spec: TrainingSpec, *, train_loss: float | None, eval_loss: float | None) -> str:
    hp = spec.hyperparameters
    base = spec.base_model.id
    modules = (
        hp.target_modules if isinstance(hp.target_modules, str) else ", ".join(hp.target_modules)
    )
    metrics = []
    if train_loss is not None:
        metrics.append(f"| Loss d'entraînement (finale) | {train_loss:.4f} |")
    if eval_loss is not None:
        metrics.append(f"| Loss de validation (finale) | {eval_loss:.4f} |")
    header = ["| Métrique | Valeur |", "|---|---|"]
    metrics_table = "\n".join([*header, *metrics]) if metrics else ""

    return f"""---
base_model: {base}
library_name: peft
pipeline_tag: text-generation
tags:
- finetuneforge
- lora
- peft
- trl
- sft
---

# {spec.output.job_name}

Adapter LoRA de [{base}](https://huggingface.co/{base}), entraîné avec
[FineTuneForge](https://github.com/beladjioo/FineTuneForge) sur {spec.dataset.sample_count}
exemples (format : `{spec.dataset.format}`).

## Utilisation

```python
from peft import AutoPeftModelForCausalLM
from transformers import AutoTokenizer

model = AutoPeftModelForCausalLM.from_pretrained("{spec.output.repo_id}", device_map="auto")
tokenizer = AutoTokenizer.from_pretrained("{spec.output.repo_id}")
```

## Entraînement

| Paramètre | Valeur |
|---|---|
| Méthode | LoRA (SFT, loss sur les réponses uniquement) |
| Rank / alpha / dropout | {hp.lora_rank} / {hp.lora_alpha} / {hp.lora_dropout} |
| Modules ciblés | {modules} |
| Learning rate | {hp.learning_rate} (warmup {hp.warmup_ratio:.0%}, cosine) |
| Epochs | {hp.epochs} |
| Batch effectif | {hp.batch_size * hp.gradient_accumulation_steps} |
| Longueur max | {hp.max_seq_length} tokens |

{metrics_table}
"""
