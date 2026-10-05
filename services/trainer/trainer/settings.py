"""Runtime configuration, read from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes"}


@dataclass(frozen=True)
class Settings:
    #: web → trainer authentication (Bearer), checked by the HTTP API.
    api_secret: str
    #: trainer → web callback signatures (HMAC).
    callback_secret: str
    #: Scratch space for checkpoints and the adapter before upload.
    workdir: str = "/tmp/finetuneforge"
    #: Development/testing only: train but do not publish to the Hub.
    skip_upload: bool = False

    @classmethod
    def from_env(cls) -> Settings:
        api_secret = os.environ.get("TRAINER_API_SECRET", "")
        callback_secret = os.environ.get("TRAINER_CALLBACK_SECRET", "")
        if not callback_secret:
            raise RuntimeError("TRAINER_CALLBACK_SECRET is required")
        return cls(
            api_secret=api_secret,
            callback_secret=callback_secret,
            workdir=os.environ.get("FTF_WORKDIR", "/tmp/finetuneforge"),
            skip_upload=_flag("FTF_SKIP_UPLOAD"),
        )
