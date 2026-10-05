"""Real (tiny) LoRA training on CPU: exercises transformers + peft + trl end to end.

The model is a randomly initialized 2-layer Llama with a freshly trained BPE
tokenizer, so the test needs no network access.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from trainer import train as train_module
from trainer.runner import run_job
from trainer.settings import Settings

from .conftest import RecordingReporter, make_spec

pytestmark = pytest.mark.slow

CHAT_TEMPLATE = (
    "{% for message in messages %}<|{{ message['role'] }}|>{{ message['content'] }}</s>{% endfor %}"
    "{% if add_generation_prompt %}<|assistant|>{% endif %}"
)


@pytest.fixture(scope="module")
def tiny_model(tmp_path_factory) -> str:
    from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers
    from transformers import LlamaConfig, LlamaForCausalLM, PreTrainedTokenizerFast

    corpus = [
        "Bonjour, où en est ma commande ?",
        "Votre commande a été expédiée hier.",
        "Quels sont vos horaires d'ouverture ?",
        "Nous sommes ouverts du lundi au vendredi.",
    ] * 20
    bpe = Tokenizer(models.BPE(unk_token="<unk>"))
    bpe.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    bpe.decoder = decoders.ByteLevel()
    bpe.train_from_iterator(
        corpus,
        trainers.BpeTrainer(
            vocab_size=400,
            special_tokens=["<unk>", "<s>", "</s>", "<pad>"],
            initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        ),
    )
    tokenizer = PreTrainedTokenizerFast(
        tokenizer_object=bpe,
        bos_token="<s>",
        eos_token="</s>",
        pad_token="<pad>",
        unk_token="<unk>",
    )
    tokenizer.chat_template = CHAT_TEMPLATE

    config = LlamaConfig(
        vocab_size=len(tokenizer),
        hidden_size=32,
        intermediate_size=64,
        num_hidden_layers=2,
        num_attention_heads=4,
        num_key_value_heads=2,
        max_position_embeddings=256,
        bos_token_id=tokenizer.bos_token_id,
        eos_token_id=tokenizer.eos_token_id,
        pad_token_id=tokenizer.pad_token_id,
    )
    path = tmp_path_factory.mktemp("tiny-llama")
    LlamaForCausalLM(config).save_pretrained(path)
    tokenizer.save_pretrained(path)
    return str(path)


def _records(fmt: str, count: int) -> list[dict]:
    if fmt == "text":
        return [
            {"text": f"Article {i} : la boutique Lumière ouvre ses portes."} for i in range(count)
        ]
    if fmt == "prompt_completion":
        return [{"prompt": f"Question {i} ?", "completion": f"Réponse {i}."} for i in range(count)]
    return [
        {
            "messages": [
                {"role": "system", "content": "Tu es le support de Lumière."},
                {"role": "user", "content": f"Où en est la commande {i} ?"},
                {"role": "assistant", "content": f"La commande {i} est expédiée."},
                {"role": "user", "content": "Merci !"},
                {"role": "assistant", "content": "Avec plaisir."},
            ]
        }
        for i in range(count)
    ]


@pytest.mark.parametrize(
    ("fmt", "supports_system", "count"),
    [("chat", False, 60), ("prompt_completion", True, 24), ("text", True, 24)],
)
def test_trains_publishes_and_reports(
    tmp_path, monkeypatch, tiny_model, fmt, supports_system, count
):
    monkeypatch.setattr(train_module, "download_jsonl", lambda _url: _records(fmt, count))
    spec = make_spec(
        dataset={"format": fmt, "sampleCount": count},
        baseModel={"supportsSystemPrompt": supports_system},
        hyperparameters={"epochs": 2, "batchSize": 8},
    )
    reporter = RecordingReporter(spec)
    settings = Settings(api_secret="", callback_secret="s", workdir=str(tmp_path), skip_upload=True)

    run_job(spec, settings, reporter=reporter, model_source=tiny_model)

    statuses = [event["status"] for event in reporter.events if event["type"] == "status"]
    assert statuses == ["preparing", "training", "uploading", "succeeded"]

    metrics = [event for event in reporter.events if event["type"] == "metric"]
    train_points = [event for event in metrics if "trainLoss" in event]
    assert train_points, "no training loss reported"
    assert all(math.isfinite(event["trainLoss"]) for event in train_points)
    assert train_points[-1]["step"] == train_points[-1]["totalSteps"]
    if count >= 50:  # eval split → validation loss each epoch
        assert sum("evalLoss" in event for event in metrics) == 2

    result = reporter.events[-1]["result"]
    assert result["repoId"] == "alice/tiny-bot" and math.isfinite(result["trainLoss"])

    adapter = Path(tmp_path) / spec.job_id / "adapter"
    assert (adapter / "adapter_config.json").exists()
    assert (adapter / "adapter_model.safetensors").exists()
    card = (adapter / "README.md").read_text(encoding="utf-8")
    assert "base_model: org/tiny-model" in card
    assert json.loads((adapter / "adapter_config.json").read_text())["r"] == 8


def test_stops_when_the_job_is_cancelled(tmp_path, monkeypatch, tiny_model):
    monkeypatch.setattr(train_module, "download_jsonl", lambda _url: _records("text", 24))
    spec = make_spec(dataset={"format": "text", "sampleCount": 24}, hyperparameters={"epochs": 3})
    # The web app answers 409 after a few events (user cancelled).
    reporter = RecordingReporter(spec, inactive_after=6)
    settings = Settings(api_secret="", callback_secret="s", workdir=str(tmp_path), skip_upload=True)

    run_job(spec, settings, reporter=reporter, model_source=tiny_model)

    statuses = [event["status"] for event in reporter.events if event["type"] == "status"]
    assert "succeeded" not in statuses and "uploading" not in statuses
