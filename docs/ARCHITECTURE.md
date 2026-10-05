# Architecture de FineTuneForge

## Vue d'ensemble

```
                         ┌───────────────────────────── apps/web (Next.js 16, Vercel) ─────────────────────────────┐
  Navigateur ──HTTPS──▶  │  App Router (RSC)   Server Actions   Route Handlers   proxy.ts (garde optimiste)        │
      │                  │        │                  │                │                                            │
      │                  │        └──── features/<domaine>/server (use cases, DAL scopé par userId) ───┐          │
      │                  │                                  │                                          │          │
      │                  │                     server/ : auth · db · storage · crypto · env            │          │
      │                  └──────────────────────────────────┬──────────────┬──────────────────────────────┼──────────┘
      │                                                     │              │                              │
      │   upload direct (URL signée)                 Postgres        Stockage objet            Inngest (Phase 2)
      └──────────────────────────────────────────▶ (Supabase…)   (S3 / Supabase / R2)     orchestration des jobs
                                                                           ▲                         │
                                                                           │ dataset (URL signée)    ▼
                                                                   services/trainer (Python, GPU : Modal / RunPod)
                                                                   transformers + peft + trl ──▶ Hugging Face Hub
```

**Principe directeur** : l'app web est la seule source de vérité (comptes, datasets, jobs, quotas).
Le travail GPU est délégué à un worker sans état qui reçoit tout ce dont il a besoin (URL signée
du dataset, hyperparamètres, token HF) et renvoie des événements signés.

## Choix de stack (et pourquoi)

| Besoin | Choix | Raison |
| --- | --- | --- |
| Frontend + backend | **Next.js 16** (App Router, RSC, Server Actions, Turbopack) | Un seul déployable, typage de bout en bout, Server Actions = mutations typées sans API REST à maintenir. |
| Auth | **Better Auth** (self-hosted) | Utilisateurs et sessions dans *notre* Postgres : fonctionne en local sans compte SaaS, pas de vendor lock-in, plugin Stripe disponible pour la Phase 4. |
| Base de données | **Postgres + Drizzle ORM** | Schéma TypeScript = types inférés partout, migrations SQL versionnées, compatible Supabase (pooler `prepare: false`). |
| Fichiers | **Abstraction `ObjectStorage`** : disque local (dev) / S3-compatible (prod) | Zéro dépendance en local ; en prod, Supabase Storage, R2 ou S3 au choix sans changer le code. |
| Validation | **Zod 4** | Env, entrées des Server Actions, réponses d'API externes. |
| UI | **Tailwind v4 + shadcn/ui** (Radix) | Composants accessibles, copiés dans le repo donc modifiables. |
| Jobs longs (Phase 2) | **Inngest** | Étapes durables, retries, timeouts, `waitForEvent` pour attendre le worker GPU ; serveur de dev local. |
| GPU (Phase 2) | **Modal** (RunPod en alternative) | Facturation à la seconde, images Python déclaratives, pas de cluster à gérer. |
| Qualité | **Biome** (lint + format), **Vitest**, `tsc --strict` + `noUncheckedIndexedAccess` | Un seul outil rapide pour le style ; tests unitaires sur la logique métier pure. |

## Structure du monorepo

```
finetuneforge/
├── apps/web/                    # App Next.js (UI + API + orchestration)
│   ├── drizzle/                 # Migrations SQL générées (ne pas éditer à la main)
│   └── src/
│       ├── app/                 # ROUTING UNIQUEMENT — pages et route handlers minces
│       │   ├── page.tsx         # Landing
│       │   ├── (auth)/          # sign-in, sign-up (redirige si déjà connecté)
│       │   ├── (app)/           # Zone connectée : layout = vérification de session + shell
│       │   │   ├── dashboard/  datasets/  datasets/new/  datasets/[datasetId]/  settings/
│       │   └── api/
│       │       ├── auth/[...all]/               # Handler Better Auth
│       │       ├── storage/local/               # Émulation des URLs signées S3 (driver local)
│       │       └── datasets/[datasetId]/download/  # Redirige vers une URL signée
│       ├── features/            # DOMAINES MÉTIER (vertical slices)
│       │   ├── auth/            # Formulaires, providers OAuth, messages d'erreur
│       │   ├── datasets/
│       │   │   ├── lib/         # Moteur d'analyse PUR (isomorphe navigateur/serveur) + tests
│       │   │   ├── server/      # queries.ts (lecture, DAL) · service.ts (use cases)
│       │   │   ├── components/  # UI du domaine
│       │   │   ├── actions.ts   # Server Actions ("use server") — fines, délèguent au service
│       │   │   └── schemas.ts   # Schémas Zod des entrées
│       │   ├── huggingface/     # Client Hub, stockage chiffré du token, carte de connexion
│       │   ├── dashboard/       # Agrégats et widgets du tableau de bord
│       │   ├── fine-tuning/     # Types du domaine (Phase 2)
│       │   └── deployments/     # Types du domaine (Phase 3)
│       ├── server/              # INFRASTRUCTURE (server-only)
│       │   ├── env.ts           # Variables d'environnement validées au démarrage
│       │   ├── auth/            # Instance Better Auth + getSession/requireSession (DAL)
│       │   ├── db/              # Client Drizzle + schema/ (une table par fichier)
│       │   ├── storage/         # ObjectStorage : local.ts, s3.ts, clés, tokens signés
│       │   ├── crypto/          # AES-256-GCM pour les secrets utilisateurs
│       │   ├── action.ts        # authedAction() : session + Zod + erreurs normalisées
│       │   └── errors.ts        # AppError (erreur métier affichable)
│       ├── components/          # UI partagée : ui/ (shadcn), layout/, brand/
│       ├── config/              # plans.ts (limites Free/Pro), site.ts
│       ├── lib/                 # Utilitaires isomorphes (cn, formats, auth-client)
│       └── proxy.ts             # Garde optimiste (cookie) sur les routes protégées
├── services/trainer/            # Worker Python GPU (Phase 2) — contrat documenté
├── docs/                        # Ce document
└── docker-compose.yml           # Postgres (+ MinIO avec --profile s3)
```

### Règles de dépendance

- `app/` → `features/` → `server/` (jamais l'inverse ; `server/db/schema` importe seulement des **types** et constantes des domaines).
- `features/*/lib` est **pur** : aucun import Node, DB ou React → testable et exécutable dans le navigateur.
- Tout ce qui touche un secret ou la DB importe `server-only` (erreur de build si un composant client l'importe).
- Les enums (statuts, formats, plans) sont déclarés **une fois** dans le domaine et réutilisés par `pgEnum` : types TS et enums Postgres ne peuvent pas diverger.

## Modèle de données

```
users ──1:1── hf_credentials        (token HF chiffré, jamais chargé avec la session)
  │
  ├──1:n── datasets ──1:n── fine_tune_jobs ──1:n── fine_tune_job_events   (logs, points de loss)
  │                              │
  │                              └──1:n── deployed_models  (Space / endpoint + page /m/{slug})
  └── sessions, accounts, verifications   (gérées par Better Auth)
```

| Table | Rôle | Points notables |
| --- | --- | --- |
| `users` | Compte | + `plan` (`free`/`pro`), `stripe_customer_id` (Phase 4). |
| `datasets` | Données d'entraînement | Cycle `uploading → processing → ready/failed` ; clés du fichier original **et** du JSONL normalisé ; `stats`, `report`, `preview` en JSONB typé. |
| `fine_tune_jobs` | Run LoRA | Modèle de base, preset, hyperparamètres (JSONB typé), statut, `progress`/`metrics` dénormalisés pour l'UI, ids provider/orchestrateur, repo de sortie. `datasets` en `ON DELETE RESTRICT` (reproductibilité). |
| `fine_tune_job_events` | Timeline du job | Append-only, identity bigint, index `(job_id, id)` pour le streaming incrémental. |
| `deployed_models` | Déploiement | Type (Space / endpoint), visibilité, statut, URLs, `slug` unique pour la page de partage. |
| `hf_credentials` | Secret HF | Chiffré AES-256-GCM, AAD = `hf_token:{userId}`, + username, rôle, indice `hf_…abcd`. |

## Flux d'import d'un dataset (Phase 1)

```
Navigateur                                   Serveur (Server Actions)                Stockage
──────────                                   ────────────────────────                ────────
1. Lecture du fichier + analyzeDataset()
   → rapport + aperçu instantanés
2. createDatasetUploadAction ─────────────▶ quotas du plan, ligne `uploading`,
                                             URL signée (15 min) ◀──────────────────
3. PUT direct du fichier (progression XHR) ────────────────────────────────────────▶ original.ext
4. finalizeDatasetUploadAction ───────────▶ claim atomique (uploading→processing),
                                             stat + re-téléchargement, analyzeDataset()
                                             (source de vérité) ────────────────────▶ normalized.jsonl
                                             rapport + stats + aperçu en DB → ready / failed
5. Redirection vers /datasets/{id}
```

Pourquoi ce design :

- **Upload direct vers le stockage** : les fonctions serverless limitent la taille des requêtes
  (≈4,5 Mo sur Vercel) ; ici aucun fichier ne transite par nos fonctions.
- **Même moteur d'analyse côté client et serveur** : retour immédiat pour l'utilisateur, mais le
  serveur revalide toujours sur les octets stockés (le client n'est jamais cru).
- **Finalisation idempotente** : `UPDATE … WHERE status = 'uploading' RETURNING` garantit qu'un
  fichier n'est traité qu'une fois, même en cas de double clic ou de retry.
- **Normalisation à l'import** : 7 dispositions d'entrée (messages OpenAI, ShareGPT,
  prompt/completion, Alpaca, question/answer, input/output, text) et le texte brut sont ramenés à
  3 formats canoniques (`text`, `prompt_completion`, `chat`) consommés nativement par
  `trl.SFTTrainer`. Le worker GPU n'a aucune logique de parsing.

### Règles de validation

| Règle | Effet |
| --- | --- |
| Extension non supportée, fichier vide/binaire, JSON non-tableau, colonnes inconnues | Bloquant |
| < 10 exemples valides ou > 100 000 | Bloquant |
| Ligne JSON invalide, champ manquant, rôle inconnu, conversation sans réponse `assistant` | Ligne ignorée (listée avec son numéro) |
| < 100 exemples, exemples > ~8k tokens, conversations non alternées | Avertissement |
| Doublons exacts | Supprimés (info) |
| Paragraphes `.txt` > 4 000 caractères | Découpés aux frontières de phrases (info) |

## Sécurité

- **Secrets applicatifs** : validés par Zod au démarrage (`server/env.ts`), jamais exposés au client
  (pas de `NEXT_PUBLIC_*` sensible).
- **Secrets utilisateurs** : token HF chiffré AES-256-GCM (IV aléatoire, tag d'authentification,
  AAD liée à l'utilisateur, préfixe de version pour la rotation de clé), validé contre l'API
  `whoami-v2` (rôle `write` exigé), seul un indice `hf_…abcd` est réaffiché.
- **Autorisation par construction** : toutes les requêtes du DAL prennent `userId` ; un dataset
  d'un autre utilisateur renvoie 404 (testé).
- **Défense en profondeur** : `proxy.ts` (cookie, optimiste) → layout `(app)` (session réelle en
  DB) → `authedAction` sur chaque mutation.
- **Stockage** : clés sous `users/{userId}/…`, validation anti path-traversal, URLs signées
  courtes (HMAC en local, SigV4 en S3).
- **Divers** : redirections `callbackUrl` limitées aux chemins relatifs, rate limiting Better Auth
  (actif en production), en-têtes de sécurité HTTP, Server Actions protégées CSRF par Next.

## Feuille de route technique

**Phase 2 — Fine-tuning**
- `config/models.ts` : catalogue (Llama-3.2-1B/3B, Qwen2.5-0.5B/1.5B/3B/7B, Gemma-2-2B, Phi-3.5-mini) avec VRAM requise et template de chat.
- Presets LoRA Débutant/Intermédiaire/Avancé → `LoraHyperparameters` (déjà typé).
- Fonction Inngest `fine-tune/run` : `step.run` (préparation, URL signée) → lancement Modal →
  `step.waitForEvent("trainer/finished", { timeout: "6h" })` → évaluation → publication Hub.
  Retries par étape, annulation via `orchestratorRunId`, quota mensuel vérifié à la création.
- `POST /api/trainer/callback` (HMAC) → `fine_tune_job_events` ; suivi temps réel par SSE.
- Nettoyage planifié des datasets restés en `uploading`.

**Phase 3 — Évaluation & déploiement** : perplexité + générations avant/après, création d'une
Space Gradio (template généré), endpoint d'API, page publique `/m/{slug}`.

**Phase 4 — Monétisation** : plugin Stripe de Better Auth, `users.plan` mis à jour par webhook,
quotas déjà centralisés dans `config/plans.ts`.
