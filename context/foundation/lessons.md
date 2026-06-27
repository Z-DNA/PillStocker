# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Exclude generated Supabase types from lint

- **Context**: Any phase/slice that regenerates DB types after a Supabase schema change — running `npm run db:types` / `supabase gen types typescript`, which writes `src/lib/database.types.ts`.
- **Problem**: The generated file violates the repo's prettier/eslint rules and contains errors that are NOT auto-fixable (e.g. `@typescript-eslint/no-redundant-type-constituents` in Supabase's generic helper unions). Hand-formatting doesn't stick (db:types overwrites it) and the unfixable errors fail the husky/lint-staged pre-commit hook, blocking the commit.
- **Rule**: Never hand-format generated type files. Add generated Supabase types (`src/lib/database.types.ts`) to eslint `ignores` in `eslint.config.js` so `npm run lint` and the pre-commit hook skip them.
- **Applies to**: plan, implement, impl-review

## Copy .env / .dev.vars into every new git worktree

- **Context**: Any fresh git worktree of this repo (new change/slice branch) and any local-run/setup step before `npm run dev` (`astro dev`) or `wrangler dev`/preview.
- **Problem**: `.env` and `.dev.vars` are gitignored, so a new worktree starts without them. `createClient` then returns `null` (SUPABASE_URL/KEY are `optional: true` in astro.config) and every page renders "Supabase is not configured" — even after `npx supabase start` succeeds. Reads as an app bug but is a missing-secrets gap; wastes debugging time.
- **Rule**: After creating a git worktree, copy the gitignored secret files from the main checkout before running the app: `cp /Users/kamilan/Developer/10xDevs/{.env,.dev.vars} .`. Keep `.env` and `.dev.vars` in sync, and restart the dev server (Astro reads `.env` only at startup).
- **Applies to**: implement, impl-review
