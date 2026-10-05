# FineTuneForge — notes pour agents

Monorepo pnpm. App principale : `apps/web` (Next.js 16, voir `apps/web/AGENTS.md` : lire la doc
embarquée dans `node_modules/next/dist/docs/` avant d'utiliser une API Next). Worker GPU Python :
`services/trainer`.

- Architecture et conventions : `docs/ARCHITECTURE.md`. Respecter la séparation
  `app/` (routing mince) · `features/<domaine>/` (`lib/` pur et testé, `server/`, `components/`)
  · `server/` (infra) · `components/ui/` (shadcn).
- Code et commentaires en anglais, textes d'interface en français.
- Toute mutation passe par `authedAction` (`src/server/action.ts`) ; toute requête DB est scopée par `userId`.
- Schéma DB : modifier `src/server/db/schema/*`, puis `pnpm db:generate` (ne jamais éditer les SQL générés).
- Contrat web ⇄ trainer : `apps/web/src/features/fine-tuning/contract.ts` et
  `services/trainer/trainer/spec.py` doivent rester alignés (vecteur HMAC partagé dans les tests).
- Jobs : jamais de logique longue dans une requête — passer par une fonction Inngest
  (`features/fine-tuning/server/workflow.ts`), étapes idempotentes.
- Avant de committer : `pnpm check`, `pnpm build`, et dans `services/trainer` : `ruff check .` + `pytest`.
