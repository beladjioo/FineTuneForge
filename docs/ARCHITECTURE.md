# Architecture de FineTuneForge

## Vue d'ensemble

```
                         ┌───────────────────────────── apps/web (Next.js 16, Vercel) ─────────────────────────────┐
  Navigateur ──HTTPS──▶  │  App Router (RSC)   Server Actions   Route Handlers   proxy.ts (garde optimiste)        │
      │   ▲  SSE         │        │                  │                │                                            │
      │   └──────────────│── /api/fine-tunes/{id}/stream                                                         │
      │                  │        └──── features/<domaine>/server (use cases, DAL scopé par userId) ───┐          │
      │                  │                     server/ : auth · db · storage · crypto · env · inngest  │          │
      │                  └──────────────────────────────────┬──────────────┬──────────────────────────────┼──────────┘
      │                                                     │              │                              │ ▲
      │   upload direct (URL signée)                 Postgres        Stockage objet                Inngest (workflows)
      └──────────────────────────────────────────▶ (Supabase…)   (S3 / Supabase / R2)                    │ │ trainer.finished
                                                                           │ dataset (URL signée)     POST /jobs │
                                                                           ▼                              ▼ │
                                                       services/trainer (Python, GPU : Modal / local) ────┘ │
                                                       transformers + peft + trl ── callbacks HMAC ──────────┘
                                                                  │
                                                                  ▼ adapter LoRA + model card
                                                          Hugging Face Hub
```

**Principe directeur** : l'app web est la seule source de vérité (comptes, datasets, jobs, quotas).
Le travail GPU est délégué à un worker sans état qui reçoit ce dont il a besoin (URL signée du
dataset, hyperparamètres), récupère le token Hugging Face au dernier moment et renvoie des
événements signés.

## Choix de stack (et pourquoi)

| Besoin | Choix | Raison |
| --- | --- | --- |
| Frontend + backend | **Next.js 16** (App Router, RSC, Server Actions, Turbopack) | Un seul déployable, typage de bout en bout, Server Actions = mutations typées sans API REST à maintenir. |
| Auth | **Better Auth** (self-hosted) | Utilisateurs et sessions dans *notre* Postgres : fonctionne en local sans compte SaaS, pas de vendor lock-in, plugin Stripe disponible pour la Phase 4. |
| Base de données | **Postgres + Drizzle ORM** | Schéma TypeScript = types inférés partout, migrations SQL versionnées, compatible Supabase (pooler `prepare: false`). |
| Fichiers | **Abstraction `ObjectStorage`** : disque local (dev) / S3-compatible (prod) | Zéro dépendance en local ; en prod, Supabase Storage, R2 ou S3 au choix sans changer le code. |
| Jobs longs | **Inngest v4** | Étapes durables (un crash ne relance que l'étape en cours), retries par étape, `waitForEvent` pour attendre le GPU sans fonction qui tourne, `cancelOn`, serveur de dev local avec UI. |
| GPU | **Modal** (+ serveur local) | Facturation à la seconde, une fonction par classe de GPU, images Python déclaratives ; la même API HTTP tourne en local pour le développement. |
| Entraînement | **transformers 5 + peft + trl** (`SFTTrainer`) | Standard de l'écosystème Hugging Face, LoRA, loss limitée aux réponses, publication directe sur le Hub. |
| Temps réel | **Server-Sent Events** | Flux unidirectionnel suffisant, reprise native (`Last-Event-ID`), pas d'infrastructure WebSocket. |
| Validation | **Zod 4** / **pydantic 2** | Env, entrées des actions, contrat avec le trainer validé des deux côtés. |
| UI | **Tailwind v4 + shadcn/ui** (Radix) | Composants accessibles, copiés dans le repo donc modifiables. |
| Qualité | **Biome**, **Vitest**, `tsc --strict` + `noUncheckedIndexedAccess`, **ruff**, **pytest** | Tests unitaires sur la logique pure et vrai entraînement d'un mini-modèle en CI. |

## Structure du monorepo

```
finetuneforge/
├── apps/web/                    # App Next.js (UI + API + orchestration)
│   ├── drizzle/                 # Migrations SQL générées (ne pas éditer à la main)
│   └── src/
│       ├── app/                 # ROUTING UNIQUEMENT — pages et route handlers minces
│       │   ├── (auth)/          # sign-in, sign-up
│       │   ├── (app)/           # Zone connectée : dashboard, datasets, fine-tunes, settings
│       │   └── api/
│       │       ├── auth/[...all]/                 # Better Auth
│       │       ├── inngest/                       # Endpoint des workflows (serve)
│       │       ├── trainer/events/                # Callbacks du trainer (HMAC)
│       │       ├── trainer/credentials/           # Token HF à la demande (HMAC)
│       │       ├── fine-tunes/[jobId]/stream/     # SSE : progression en direct
│       │       ├── storage/local/                 # Émulation des URLs signées (driver local)
│       │       └── datasets/[datasetId]/download/ # Redirection vers une URL signée
│       ├── features/            # DOMAINES MÉTIER (vertical slices)
│       │   ├── datasets/        # lib/ (analyse pure + tests) · server/ · components/ · actions
│       │   ├── fine-tuning/
│       │   │   ├── lib/         # presets, estimations, machine à états, courbes — PUR + tests
│       │   │   ├── contract.ts  # Contrat web ⇄ trainer (zod)
│       │   │   ├── events.ts    # Événements Inngest typés
│       │   │   ├── server/      # service (création, quotas, annulation) · orchestration (étapes)
│       │   │   │                # · workflow (fonctions Inngest) · ingest (événements trainer)
│       │   │   │                # · providers/ (simulated, http) · queries · serializers
│       │   │   └── components/  # assistant de lancement, vue live, courbe de loss, logs
│       │   ├── huggingface/     # Client Hub, token chiffré, carte de connexion
│       │   ├── dashboard/  auth/  deployments/
│       ├── server/              # INFRASTRUCTURE (server-only)
│       │   ├── env.ts           # Variables validées au démarrage (règles croisées)
│       │   ├── auth/  db/  storage/  crypto/
│       │   ├── inngest.ts       # Client Inngest
│       │   ├── trainer-signature.ts  # HMAC des callbacks
│       │   ├── action.ts        # authedAction() : session + Zod + erreurs normalisées
│       │   └── errors.ts        # AppError (erreur métier affichable)
│       ├── components/          # UI partagée : ui/ (shadcn), layout/, brand/
│       ├── config/              # plans.ts (limites Free/Pro), models.ts (catalogue), site.ts
│       ├── lib/  hooks/         # Utilitaires isomorphes
│       └── proxy.ts             # Garde optimiste (cookie) sur les routes protégées
├── services/trainer/            # Worker Python (voir son README)
├── docs/                        # Ce document
├── .github/workflows/ci.yml     # Lint, types, tests web + trainer
└── docker-compose.yml           # Postgres (+ MinIO avec --profile s3)
```

### Règles de dépendance

- `app/` → `features/` → `server/` (jamais l'inverse ; `server/db/schema` importe seulement des **types** et constantes des domaines).
- `features/*/lib` est **pur** : aucun import Node, DB ou React → testable et exécutable dans le navigateur.
- Tout ce qui touche un secret ou la DB importe `server-only` (erreur de build si un composant client l'importe).
- Les enums (statuts, formats, plans, providers) sont déclarés **une fois** dans le domaine et réutilisés par `pgEnum`.

## Modèle de données

```
users ──1:1── hf_credentials        (token HF chiffré, jamais chargé avec la session)
  │
  ├──1:n── datasets ──1:n── fine_tune_jobs ──1:n── fine_tune_job_events   (logs, points de loss, statuts)
  │                              │
  │                              └──1:n── deployed_models  (Phase 3 : Space / endpoint + page /m/{slug})
  └── sessions, accounts, verifications   (gérées par Better Auth)
```

| Table | Rôle | Points notables |
| --- | --- | --- |
| `users` | Compte | + `plan` (`free`/`pro`), `stripe_customer_id` (Phase 4). |
| `datasets` | Données d'entraînement | Cycle `uploading → processing → ready/failed` ; fichier original **et** JSONL normalisé ; `stats`, `report`, `preview` en JSONB typé. |
| `fine_tune_jobs` | Run LoRA | Modèle, preset, hyperparamètres (JSONB typé), statut, `progress`/`metrics` dénormalisés, provider + `provider_run_id`, `orchestrator_run_id`, destination et dépôt de sortie, `last_event_at` (watchdog). Dataset en `ON DELETE RESTRICT`. |
| `fine_tune_job_events` | Timeline | Append-only ; `seq` du trainer avec index unique `(job_id, seq)` → livraisons rejouées ignorées. |
| `deployed_models` | Déploiement (Phase 3) | Type, visibilité, statut, URLs, `slug` unique. |
| `hf_credentials` | Secret HF | AES-256-GCM, AAD = `hf_token:{userId}`, + username, rôle, indice `hf_…abcd`. |

## Flux d'import d'un dataset

```
Navigateur                                   Serveur (Server Actions)                Stockage
1. Lecture du fichier + analyzeDataset()
   → rapport + aperçu instantanés
2. createDatasetUploadAction ─────────────▶ quotas du plan, ligne `uploading`, URL signée
3. PUT direct du fichier (progression XHR) ──────────────────────────────────────────▶ original.ext
4. finalizeDatasetUploadAction ───────────▶ claim atomique, analyzeDataset() sur les octets
                                             stockés (source de vérité) ─────────────▶ normalized.jsonl
5. Redirection vers /datasets/{id}
```

Upload direct (les fonctions serverless limitent les requêtes à ~4,5 Mo), même moteur d'analyse
côté client et serveur (le client n'est jamais cru), finalisation idempotente
(`UPDATE … WHERE status = 'uploading' RETURNING`), normalisation de 7 dispositions d'entrée vers 3
formats canoniques (`text`, `prompt_completion`, `chat`).

## Flux d'un fine-tuning

```
UI (assistant)        Server Action            Inngest `run-fine-tune`               Trainer (GPU)
──────────────        ─────────────            ───────────────────────               ─────────────
Lancer ────────────▶ verrou ligne user,
                      quotas (mois, parallèle),
                      job `queued` ──event──▶ prepare : dataset prêt, accès au modèle
                                               (licence acceptée ?), dépôt HF créé
                                               (suffixe si nom pris)
                                              dispatch : URL signée du dataset ─POST /jobs─▶ preparing
                                                                                  ◀─credentials─ token HF (JIT)
                                              waitForEvent(trainer.finished, 10 min)   training
/fine-tunes/{id} ◀── SSE ── events en DB ◀──── /api/trainer/events (HMAC) ◀──────── metric / log
                                               ↺ health check entre deux attentes      uploading → Hub
                                              finalize ◀──── trainer.finished ◀────── succeeded
```

### Robustesse

| Risque | Parade |
| --- | --- |
| Erreur transitoire (réseau, Hub, base) | 3 retries par étape Inngest ; une étape réussie n'est jamais rejouée. |
| Problème à corriger par l'utilisateur (licence non acceptée, token sans rôle Write, nom pris) | `NonRetriableError` avec un message en français, affiché sur la page du job. |
| Worker mort sans prévenir (OOM, préemption, callbacks perdus) | Attente par tranches de 10 min + health check : silence > 20 min → statut demandé au provider ; > 60 min → échec. Durée max 8 h. |
| Événements rejoués ou désordonnés | `seq` unique par job, machine à états qui n'avance que vers l'avant (garde dans le `WHERE` SQL), métriques monotones. |
| Événement `trainer.finished` envoyé avant l'attente | Le health check suivant voit le statut final en base. Id d'événement déterministe → renvoi idempotent. |
| Double lancement / quota contourné | Transaction avec `SELECT … FOR UPDATE` sur l'utilisateur ; échecs et annulations non décomptés. |
| Double démarrage GPU | `dispatch` réutilise `provider_run_id` s'il existe. |
| Annulation | Statut `cancelled` (garde SQL) → `cancelOn` arrête le workflow, une fonction dédiée annule le run GPU (5 retries) ; le trainer reçoit 409 sur ses callbacks et s'arrête ; plus de token délivré. |
| Échec final | `onFailure` marque le job en échec avec la raison et coupe le GPU. |

### Côté trainer

Une ligne d'entraînement par réponse `assistant` (contexte complet en prompt) : la loss porte
uniquement sur les réponses, sans dépendre des marqueurs de génération du chat template. Split
d'évaluation déterministe (règle partagée avec l'estimation affichée dans l'assistant). Détails dans
[`services/trainer/README.md`](../services/trainer/README.md).

### Providers

| Provider | Usage | Détail |
| --- | --- | --- |
| `simulated` | Développement de l'UI, démos | Mêmes événements, même ingestion, dans le process Node ; aucun appel au Hub. Refusé en production sauf `ALLOW_SIMULATED_TRAINING`. |
| `local` | Développement avec GPU | `uvicorn trainer.server:app` : un processus par job, annulation = `terminate`. |
| `modal` | Production | Une fonction Modal par classe de GPU (L4, A10G, L40S, A100), cache des poids sur un Volume. |

## Sécurité

- **Secrets applicatifs** : validés par Zod au démarrage, avec règles croisées (S3, trainer,
  namespace plateforme) ; jamais exposés au client.
- **Token Hugging Face** : chiffré AES-256-GCM (IV aléatoire, AAD liée à l'utilisateur, version
  pour la rotation), validé via `whoami-v2` (rôle Write exigé). Il n'apparaît **jamais** dans la
  spec d'entraînement, l'état Inngest ou les entrées Modal : le trainer le demande juste-à-temps via
  une requête signée, uniquement pendant qu'un job est actif.
- **Callbacks du trainer** : HMAC-SHA256 sur `timestamp.body`, fenêtre de 5 min (anti-rejeu),
  comparaison à temps constant, corps limité à 64 Ko, validation stricte du contrat.
- **API du trainer** : `Bearer` comparé à temps constant.
- **Autorisation par construction** : toutes les requêtes du DAL prennent `userId` ; un job ou un
  dataset d'un autre utilisateur renvoie 404 (testé), y compris le flux SSE.
- **Défense en profondeur** : `proxy.ts` (cookie) → layout `(app)` (session en DB) →
  `authedAction` sur chaque mutation.
- **Stockage** : clés sous `users/{userId}/…`, anti path-traversal, URLs signées courtes.

## Feuille de route

**Phase 3 — Évaluation & déploiement** : perplexité (à partir de la loss de validation déjà
mesurée) et générations avant/après sur des exemples réservés, Space Gradio générée, endpoint
d'API, page publique `/m/{slug}` (`deployed_models`).

**Phase 4 — Monétisation** : plugin Stripe de Better Auth, `users.plan` mis à jour par webhook,
quotas déjà centralisés dans `config/plans.ts` et appliqués.

**Dette connue** : provider RunPod non implémenté ; nettoyage planifié des datasets restés en
`uploading` (fonction Inngest cron) ; estimation de durée à calibrer sur de vrais runs.
