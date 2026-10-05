# services/trainer — worker GPU

Service Python qui exécute réellement le fine-tuning LoRA (`transformers` + `peft` + `trl`).
Il est **séparé de l'app web** : il tourne sur GPU (Modal en production, ou votre machine) et ne
partage avec elle qu'un contrat HTTP + JSON, sans état.

```
trainer/
├── spec.py        Contrat (miroir de apps/web/src/features/fine-tuning/contract.ts)
├── signing.py     Signature HMAC des callbacks (vecteur de test partagé avec le TS)
├── reporter.py    Événements signés vers l'app (retries, seq idempotent, 409 = arrêt)
├── data.py        JSONL normalisé → datasets TRL (split train/éval, une ligne par réponse)
├── train.py       SFT LoRA, courbe de loss en direct, publication sur le Hub
├── card.py        Model card (README) publiée avec l'adapter
├── runner.py      Exécution d'un job + messages d'erreur lisibles
├── api.py         API HTTP commune (local et Modal)
├── server.py      Serveur local : un processus par job (annulation = terminate)
├── modal_app.py   Déploiement Modal : une fonction par classe de GPU + endpoint web
└── cli.py         `python -m trainer.cli spec.json`
```

## Contrat avec l'app web

| Sens | Requête | Auth |
| --- | --- | --- |
| web → trainer | `POST /jobs` `{spec, gpu}` → `{runId}` | `Bearer TRAINER_API_SECRET` |
| web → trainer | `GET /jobs/{runId}` → `{status}` · `POST /jobs/{runId}/cancel` | idem |
| trainer → web | `POST spec.callbacks.eventsUrl` (status / metric / log) | HMAC `TRAINER_CALLBACK_SECRET` |
| trainer → web | `POST spec.callbacks.credentialsUrl` → `{hfToken}` | idem |

- Le **token Hugging Face n'est jamais dans la spec** : le trainer le demande au moment de
  démarrer (et l'app ne le délivre que si le job est actif). Il n'est ni loggé ni écrit sur disque.
- Les événements portent un `seq` croissant : un envoi rejoué est ignoré par l'app.
- Une réponse **409** signifie que le job n'est plus actif (annulé…) : l'entraînement s'arrête.

## Choix d'entraînement

- **Conversations** : une ligne d'entraînement par réponse `assistant`, avec toute la
  conversation précédente comme prompt → TRL calcule la loss **uniquement sur les réponses**
  (vérifié : les tokens du prompt ont le label `-100`), sans dépendre de marqueurs
  `{% generation %}` absents de la plupart des chat templates.
- **Instruction → réponse** : convertie au format conversationnel (le chat template du modèle
  est appliqué, comme à l'inférence).
- **Texte brut** : language modeling classique.
- Modèles sans rôle `system` (Gemma, Mistral) : le message système est fusionné au premier
  message utilisateur.
- Split d'évaluation déterministe (10 %, max 200, à partir de 50 exemples) → loss de validation
  à chaque epoch. Cosine schedule, warmup, gradient checkpointing et `auto_find_batch_size` sur GPU.

## Développement

```bash
cd services/trainer
uv venv && uv pip install -e ".[dev]"      # ou pip install -e ".[dev]"
pytest -m "not slow"                       # tests rapides
pytest -m slow                             # vrai entraînement d'un mini-modèle sur CPU (~10 s)
ruff check . && ruff format --check .
```

### Utiliser le trainer local depuis l'app

```bash
# mêmes secrets que apps/web/.env.local
export TRAINER_API_SECRET=... TRAINER_CALLBACK_SECRET=...
uvicorn trainer.server:app --port 8000
```

Puis dans `apps/web/.env.local` : `TRAINING_PROVIDER=local` et `TRAINER_URL=http://localhost:8000`.
Un GPU NVIDIA est recommandé ; sur CPU, seul le modèle de test `SmolLM2 135M (dev)` est raisonnable.

Variables utiles : `FTF_WORKDIR` (répertoire de travail), `FTF_MAX_CONCURRENT_JOBS` (défaut 1),
`FTF_SKIP_UPLOAD=1` (développement : entraîne sans publier sur le Hub).

## Production (Modal)

```bash
pip install modal && modal setup
modal secret create finetuneforge-trainer TRAINER_API_SECRET=... TRAINER_CALLBACK_SECRET=...
modal deploy trainer/modal_app.py
```

Renseigner ensuite `TRAINING_PROVIDER=modal` et `TRAINER_URL` (URL de l'endpoint `web` affichée
par Modal) dans l'app. Les poids des modèles sont mis en cache sur un Volume Modal ; chaque classe
de GPU du catalogue (L4, A10G, L40S, A100-80GB) a sa propre fonction.
