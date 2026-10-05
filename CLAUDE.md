# FineTuneForge — notes pour agents

Monorepo pnpm. App principale : `apps/web` (Next.js 16, voir `apps/web/AGENTS.md` : lire la doc
embarquée dans `node_modules/next/dist/docs/` avant d'utiliser une API Next).

- Architecture et conventions : `docs/ARCHITECTURE.md`. Respecter la séparation
  `app/` (routing mince) · `features/<domaine>/` · `server/` (infra) · `components/ui/` (shadcn).
- Code et commentaires en anglais, textes d'interface en français.
- Toute mutation passe par `authedAction` (`src/server/action.ts`) ; toute requête DB est scopée par `userId`.
- Schéma DB : modifier `src/server/db/schema/*`, puis `pnpm db:generate` (ne jamais éditer les SQL générés).
- Avant de committer : `pnpm check` (Biome + tsc + Vitest) et `pnpm build`.
