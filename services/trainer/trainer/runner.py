"""Runs one job end to end and reports the outcome.

Shared by the CLI, the local server and the Modal workers.
"""

from __future__ import annotations

import logging

from .reporter import EventReporter, JobInactiveError
from .settings import Settings
from .spec import TrainingSpec
from .train import run_training

logger = logging.getLogger(__name__)


def describe_error(error: BaseException) -> str:
    """French, user-facing explanation of a training failure."""
    name = type(error).__name__
    text = str(error)
    if name == "OutOfMemoryError" or "out of memory" in text.lower():
        return (
            "Mémoire GPU insuffisante. Réduisez la longueur maximale ou le batch size, "
            "ou choisissez un modèle plus petit."
        )
    if name == "GatedRepoError":
        return "Accès refusé au modèle : acceptez sa licence sur Hugging Face puis relancez."
    if name in {"RepositoryNotFoundError", "RevisionNotFoundError"}:
        return "Modèle ou dépôt introuvable sur Hugging Face."
    if name in {"HTTPStatusError", "ConnectError", "ReadTimeout"} and "dataset" in text.lower():
        return "Impossible de télécharger le dataset."
    return f"Erreur pendant l'entraînement ({name}) : {text[:300]}"


def run_job(
    spec: TrainingSpec,
    settings: Settings,
    reporter: EventReporter | None = None,
    model_source: str | None = None,
) -> None:
    reporter = reporter or EventReporter(spec, settings.callback_secret)
    try:
        reporter.status("preparing", "Préparation de l'environnement d'entraînement")
        hf_token = reporter.fetch_hf_token()
        result = run_training(
            spec, reporter, hf_token=hf_token, settings=settings, model_source=model_source
        )
        reporter.status("succeeded", "Fine-tuning terminé", result=result)
    except JobInactiveError:
        logger.info("job %s is no longer active on the web app: stopping", spec.job_id)
    except BaseException as error:
        logger.exception("job %s failed", spec.job_id)
        try:
            reporter.status("failed", describe_error(error))
        except Exception:
            logger.exception("could not report the failure of job %s", spec.job_id)
        raise
