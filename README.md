# FineTuneForge

> Fine-tunez un petit modèle open-source (1B–7B) sur vos propres données et déployez-le en un
> clic sur Hugging Face — sans expertise ML.

Importer ses données → choisir un modèle → fine-tuning LoRA → évaluation → Space Hugging Face + API.

| Phase | Contenu | État |
| --- | --- | --- |
| 1 — Fondation | Auth, dashboard, import + validation de datasets, token Hugging Face chiffré | ✅ |
| 2 — Fine-tuning | Catalogue de modèles, presets LoRA, jobs durables, suivi temps réel (logs + loss), publication sur le Hub | ✅ |
| 3 — Évaluation & déploiement | Perplexité, exemples avant/après, Space Gradio, endpoint d'API, page de partage | à venir |
| 4 — Monétisation | Plans Free / Pro avec Stripe | à venir (quotas déjà appliqués) |

Architecture détaillée : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
worker GPU : [`services/trainer/README.md`](services/trainer/README.md).

## Stack

Next.js 16 (App Router, Server Actions, Turbopack) · TypeScript strict · Tailwind v4 + shadcn/ui ·
Better Auth · Postgres + Drizzle ORM · stockage S3-compatible (ou disque en local) · Inngest
(workflows durables) · worker Python `transformers` + `peft` + `trl` sur Modal (ou en local) ·
Zod · Biome · Vitest · Pytest.

## Démarrage local

Prérequis : Node 22+, pnpm 10, Docker (ou un Postgres local). Python 3.11+ seulement pour
entraîner réellement en local.

```bash
pnpm install
pnpm db:up                                   # Postgres via docker compose
cp apps/web/.env.example apps/web/.env.local
# Renseigner BETTER_AUTH_SECRET et ENCRYPTION_KEY : openssl rand -base64 32 (une valeur chacun)
pnpm db:migrate                              # applique les migrations
```

Puis, dans deux terminaux :

```bash
pnpm dev                                     # app → http://localhost:3000
pnpm inngest:dev                             # orchestrateur → http://localhost:8288
```

Par défaut, `TRAINING_PROVIDER=simulated` : les fine-tunings suivent tout le parcours réel
(workflow, événements, interface temps réel) avec un **entraîneur simulé**, sans GPU, sans Python
et sans compte Hugging Face. Idéal pour développer l'interface.

### Entraîner pour de vrai

- **Sur votre machine** (GPU NVIDIA recommandé) : lancer le trainer Python (voir
  [`services/trainer/README.md`](services/trainer/README.md)), puis `TRAINING_PROVIDER=local`,
  `TRAINER_URL=http://localhost:8000`, `TRAINER_API_SECRET` et `TRAINER_CALLBACK_SECRET`
  (mêmes valeurs des deux côtés, `openssl rand -hex 32`). Connectez votre compte Hugging Face dans
  *Paramètres* : c'est là que les modèles sont publiés.
- **Sur GPU serverless** : déployer `services/trainer/trainer/modal_app.py` sur Modal et utiliser
  `TRAINING_PROVIDER=modal`. Le trainer doit pouvoir joindre l'app (`TRAINER_CALLBACK_BASE_URL`,
  par exemple un tunnel en développement).

### Stockage S3 en local (optionnel)

Les fichiers sont stockés sur disque par défaut (`apps/web/.data/storage`). Pour tester le driver S3 :

```bash
docker compose --profile s3 up -d            # MinIO sur :9000 (console :9001), bucket créé
# puis dans .env.local :
# STORAGE_DRIVER=s3  S3_ENDPOINT=http://localhost:9000
# S3_ACCESS_KEY_ID=ftf-minio  S3_SECRET_ACCESS_KEY=ftf-minio-secret  S3_BUCKET=finetuneforge
```

## Scripts

| Commande | Effet |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | App web |
| `pnpm inngest:dev` | Serveur de développement Inngest (UI des runs sur :8288) |
| `pnpm check` | Lint + format (Biome), typecheck (tsc), tests (Vitest) |
| `pnpm format` | Corrige le formatage et l'ordre des imports |
| `pnpm db:generate` | Génère une migration SQL après modification de `src/server/db/schema` |
| `pnpm db:migrate` / `pnpm db:studio` | Applique les migrations / ouvre Drizzle Studio |

Côté trainer : `pytest` (dont un vrai entraînement d'un mini-modèle sur CPU) et `ruff check .`.
La CI GitHub Actions exécute l'ensemble.

## Configuration

Toutes les variables sont documentées dans [`apps/web/.env.example`](apps/web/.env.example) et
validées au démarrage (`apps/web/src/server/env.ts`) : l'app refuse de démarrer avec une
configuration invalide et indique la variable fautive (ex. `TRAINER_URL` manquant avec
`TRAINING_PROVIDER=modal`, mode simulé en production).

**Production** (ex. Vercel + Supabase + Inngest Cloud + Modal) :

- `DATABASE_URL` : URL du pooler Supabase (le client est configuré avec `prepare: false`).
- `STORAGE_DRIVER=s3` avec les clés S3 de Supabase Storage (ou R2 / S3). Le bucket doit autoriser
  les `PUT` depuis l'origine de l'app (CORS), car le navigateur y envoie les fichiers directement.
- Inngest : retirer `INNGEST_DEV`, renseigner `INNGEST_EVENT_KEY` et `INNGEST_SIGNING_KEY`, puis
  synchroniser l'app (`https://<app>/api/inngest`) depuis le dashboard Inngest.
- `TRAINING_PROVIDER=modal`, `TRAINER_URL`, `TRAINER_API_SECRET`, `TRAINER_CALLBACK_SECRET`.
- `APP_URL` : URL publique (callbacks OAuth, URLs signées, callbacks du trainer).
- Optionnel : `HF_PLATFORM_TOKEN` + `HF_PLATFORM_ORG` pour proposer la publication sur
  l'organisation FineTuneForge plutôt que sur le compte de l'utilisateur.

## Formats de dataset acceptés

| Fichier | Dispositions reconnues |
| --- | --- |
| `.jsonl` / `.ndjson` / `.json` | `messages` (OpenAI), `conversations` (ShareGPT), `prompt`/`completion`, `instruction`/`input`/`output` (Alpaca), `question`/`answer`, `input`/`output`, `text` |
| `.csv` / `.tsv` | Colonnes `prompt`/`completion`, `question`/`answer`, `instruction`/`output`, `input`/`output` ou `text` (séparateur `,` `;` ou tabulation détecté) |
| `.txt` / `.md` / texte collé | Un paragraphe (bloc séparé par une ligne vide) = un exemple |

Chaque import est analysé dans le navigateur (aperçu instantané) puis revalidé côté serveur, et
converti en JSONL canonique consommé par le trainer (`trl.SFTTrainer`).

## Modèles proposés

Llama 3.2 1B / 3B, Qwen 2.5 0.5B / 1.5B / 3B / 7B, Gemma 2 2B, Phi-3.5 mini, Mistral 7B v0.3
(variantes *Instruct*). Le catalogue (`apps/web/src/config/models.ts`) précise la licence (dont
l'usage commercial), les modèles soumis à licence sur Hugging Face, la prise en charge du rôle
`system` et la classe de GPU utilisée.
