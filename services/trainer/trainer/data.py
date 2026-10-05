"""Turns the normalized JSONL produced by the web app into TRL-ready datasets.

Input formats (one JSON object per line, see the web app's dataset normalization):
  text               {"text": "..."}
  prompt_completion  {"prompt": "...", "completion": "..."}
  chat               {"messages": [{"role": "system"|"user"|"assistant", "content": "..."}]}

Output rows:
  text               {"text": ...}                                   → language modeling
  everything else    {"prompt": [messages], "completion": [message]} → conversational
                     prompt-completion: the chat template is applied and the loss is
                     computed on the assistant answer only (TRL's completion-only loss).
"""

from __future__ import annotations

import json
import random
from typing import Any

import httpx

from .spec import DatasetFormat, eval_split_size

Message = dict[str, str]
Row = dict[str, Any]

SPLIT_SEED = 42


def download_jsonl(url: str, client: httpx.Client | None = None) -> list[dict[str, Any]]:
    http = client or httpx.Client(timeout=120, follow_redirects=True)
    response = http.get(url)
    response.raise_for_status()
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def split_records(records: list[Row], sample_count: int) -> tuple[list[Row], list[Row]]:
    """Deterministic train/eval split, by original sample (no conversation leaks across sets)."""
    eval_size = min(eval_split_size(sample_count), max(0, len(records) - 1))
    shuffled = records[:]
    random.Random(SPLIT_SEED).shuffle(shuffled)
    return shuffled[eval_size:], shuffled[:eval_size]


def merge_system_prompt(messages: list[Message]) -> list[Message]:
    """For chat templates without a system role: prepend it to the first user turn."""
    if not messages or messages[0]["role"] != "system":
        return messages
    system, rest = messages[0]["content"], messages[1:]
    merged: list[Message] = []
    pending = system
    for message in rest:
        if pending and message["role"] == "user":
            merged.append({"role": "user", "content": f"{pending}\n\n{message['content']}"})
            pending = ""
        else:
            merged.append(message)
    return merged


def conversation_to_rows(messages: list[Message]) -> list[Row]:
    """One training row per assistant answer, with the whole preceding conversation as prompt."""
    rows: list[Row] = []
    for index, message in enumerate(messages):
        if message["role"] != "assistant" or index == 0:
            continue
        prompt = messages[:index]
        if not any(turn["role"] == "user" for turn in prompt):
            continue
        rows.append({"prompt": prompt, "completion": [message]})
    return rows


def to_training_rows(
    records: list[Row], fmt: DatasetFormat, supports_system_prompt: bool
) -> list[Row]:
    rows: list[Row] = []
    for record in records:
        if fmt == "text":
            rows.append({"text": record["text"]})
        elif fmt == "prompt_completion":
            rows.append(
                {
                    "prompt": [{"role": "user", "content": record["prompt"]}],
                    "completion": [{"role": "assistant", "content": record["completion"]}],
                }
            )
        else:
            messages = [{"role": m["role"], "content": m["content"]} for m in record["messages"]]
            if not supports_system_prompt:
                messages = merge_system_prompt(messages)
            rows.extend(conversation_to_rows(messages))
    return rows
