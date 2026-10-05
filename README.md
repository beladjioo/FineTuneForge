# FineTuneForge

> Fine-tunez un petit modèle open-source (1B–7B) sur vos propres données et déployez-le en un
> clic sur Hugging Face — sans expertise ML.

Importer ses données → choisir un modèle → fine-tuning LoRA → évaluation → Space Hugging Face + API.

**État actuel : Phase 1 (fondation) livrée** — auth, dashboard, import et validation de datasets,
connexion Hugging Face sécurisée. Le schéma de données couvre déjà les phases suivantes.
Architecture détaillée : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Next.js 16 (App Router, Server Actions, Turbopack) · TypeScript strict · Tailwind v4 + shadcn/ui ·
Better Auth · Postgres + Drizzle ORM · stockage S3-compatible (ou disque en local) · Zod · Biome ·
Vitest. Prévu : Inngest (jobs), Modal (GPU), `transformers` / `peft` / `trl`, Stripe.

## Démarrage local

Prérequis : Node 22+, pnpm 10, Docker (ou un Postgres local).

```bash
pnpm install
pnpm db:up                                   # Postgres via docker compose
cp apps/web/.env.example apps/web/.env.local
# Renseigner BETTER_AUTH_SECRET et ENCRYPTION_KEY :
#   openssl rand -base64 32   (une fois pour chaque variable)
pnpm db:migrate                              # applique les migrations
pnpm dev                                     # http://localhost:3000
```

Par défaut les fichiers sont stockés sur disque (`apps/web/.data/storage`) : aucun service
supplémentaire n'est nécessaire. Pour tester le driver S3 en local :

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
| `pnpm check` | Lint + format (Biome), typecheck (tsc), tests (Vitest) |
| `pnpm format` | Corrige le formatage et l'ordre des imports |
| `pnpm db:generate` | Génère une migration SQL après modification de `src/server/db/schema` |
| `pnpm db:migrate` / `pnpm db:studio` | Applique les migrations / ouvre Drizzle Studio |

## Configuration

Toutes les variables sont documentées dans [`apps/web/.env.example`](apps/web/.env.example) et
validées au démarrage (`apps/web/src/server/env.ts`) : l'app refuse de démarrer avec une
configuration invalide et indique la variable fautive.

**Production** (ex. Vercel + Supabase) :

- `DATABASE_URL` : URL du pooler Supabase (le client est configuré avec `prepare: false`).
- `STORAGE_DRIVER=s3` avec les clés S3 de Supabase Storage (ou R2 / S3). Le bucket doit autoriser
  les `PUT` depuis l'origine de l'app (CORS), car le navigateur y envoie les fichiers directement.
- `APP_URL` : URL publique (sert aux callbacks OAuth et aux URLs signées).
- OAuth GitHub/Google : optionnels, les boutons n'apparaissent que si les deux clés sont définies
  (callback : `{APP_URL}/api/auth/callback/{github|google}`).

## Formats de dataset acceptés

| Fichier | Dispositions reconnues |
| --- | --- |
| `.jsonl` / `.ndjson` / `.json` | `messages` (OpenAI), `conversations` (ShareGPT), `prompt`/`completion`, `instruction`/`input`/`output` (Alpaca), `question`/`answer`, `input`/`output`, `text` |
| `.csv` / `.tsv` | Colonnes `prompt`/`completion`, `question`/`answer`, `instruction`/`output`, `input`/`output` ou `text` (séparateur `,` `;` ou tabulation détecté) |
| `.txt` / `.md` / texte collé | Un paragraphe (bloc séparé par une ligne vide) = un exemple |

Chaque import est analysé dans le navigateur (aperçu instantané) puis revalidé côté serveur, et
converti en JSONL canonique directement consommable par `trl.SFTTrainer`.
