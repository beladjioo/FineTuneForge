# services/trainer — worker GPU (Phase 2)

Service Python qui exécute réellement le fine-tuning LoRA. Il est volontairement **séparé de
l'app web** : il tourne sur GPU (Modal, RunPod, ou une machine locale avec CUDA) et ne partage
avec elle qu'un contrat HTTP + JSON.

## Stack prévue

- `transformers` + `peft` (LoRA) + `trl` (`SFTTrainer`) + `datasets`
- `huggingface_hub` pour pousser l'adapter (et éventuellement le modèle fusionné)
- Entrée Modal (`modal_app.py`) **et** CLI locale (`python -m trainer.run job.json`) partageant le même code

## Contrat avec l'app web

**Entrée** (envoyée par la fonction Inngest qui orchestre le job) :

```jsonc
{
  "jobId": "uuid",
  "baseModelId": "Qwen/Qwen2.5-1.5B-Instruct",
  "datasetUrl": "https://…/normalized.jsonl?signature=…", // URL signée, courte durée
  "datasetFormat": "chat",                                 // text | prompt_completion | chat
  "hyperparameters": { "loraRank": 16, "loraAlpha": 32, "learningRate": 0.0002, "epochs": 3, "…": "…" },
  "output": { "repoId": "alice/support-bot-lora", "private": true },
  "callbackUrl": "https://app/api/trainer/callback",       // events signés HMAC
  "hfToken": "…"                                           // transmis via secret du provider, jamais loggé
}
```

**Sortie** : events `POST callbackUrl` signés (HMAC-SHA256, header `X-FTF-Signature`) :
`status` (preparing → training → evaluating → uploading → succeeded/failed), `metric`
(`step`, `epoch`, `loss`, `learningRate`) et `log`. Ils alimentent `fine_tune_job_events`
et les colonnes `progress` / `metrics` de `fine_tune_jobs` (suivi temps réel dans l'UI).

Le dataset normalisé (une ligne JSON par exemple, formats natifs de `SFTTrainer`) est produit
par l'app web à l'import — le worker n'a aucune logique de parsing.
