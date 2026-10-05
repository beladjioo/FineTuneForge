"""Run a job from a spec file: `python -m trainer.cli spec.json [--model-source PATH]`."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from .runner import run_job
from .settings import Settings
from .spec import TrainingSpec


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path, help="TrainingSpec JSON file")
    parser.add_argument("--model-source", help="Load weights from this path instead of the Hub")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    spec = TrainingSpec.model_validate_json(args.spec.read_text(encoding="utf-8"))
    run_job(spec, Settings.from_env(), model_source=args.model_source)


if __name__ == "__main__":
    main()
