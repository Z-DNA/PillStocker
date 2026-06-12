# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Exclude generated Supabase types from lint

- **Context**: Any phase/slice that regenerates DB types after a Supabase schema change — running `npm run db:types` / `supabase gen types typescript`, which writes `src/lib/database.types.ts`.
- **Problem**: The generated file violates the repo's prettier/eslint rules and contains errors that are NOT auto-fixable (e.g. `@typescript-eslint/no-redundant-type-constituents` in Supabase's generic helper unions). Hand-formatting doesn't stick (db:types overwrites it) and the unfixable errors fail the husky/lint-staged pre-commit hook, blocking the commit.
- **Rule**: Never hand-format generated type files. Add generated Supabase types (`src/lib/database.types.ts`) to eslint `ignores` in `eslint.config.js` so `npm run lint` and the pre-commit hook skip them.
- **Applies to**: plan, implement, impl-review
