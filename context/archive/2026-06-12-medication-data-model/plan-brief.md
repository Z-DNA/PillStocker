# Medication Data Model — Plan Brief

> Full plan: `context/changes/medication-data-model/plan.md`

## What & Why

Add PillStocker's first database schema — a `medications` table with owner-only row-level security, soft-delete, and generated TypeScript types. This is roadmap foundation **F-01**: every other slice reads/writes this one record, and it's where the "medication data is readable only by its owner" NFR is actually enforced (in the DB, since the app uses the RLS-respecting publishable key).

## Starting Point

The data layer is empty — Supabase is wired for **auth only** (`auth.users`), `supabase/` has just `config.toml` with no `migrations/` dir, and `createClient()` (`src/lib/supabase.ts`) is untyped and null-safe. The `supabase` CLI is installed; there are no `db:*` scripts. README currently (wrongly, after this change) says "no tables/migrations required."

## Desired End State

A `medications` table lives in both the local stack and the cloud project with owner-only RLS proven by a two-user check; `src/lib/database.types.ts` is generated and committed; `createClient` returns a `SupabaseClient<Database>`; and `astro sync` / `build` / `lint` pass. No query/CRUD code yet — that's S-01.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dosing/count shape | Three numeric columns (`pill_count`, `dose_morning/midday/night`) | Simple, queryable, matches the PRD's fixed morning/midday/night model | Plan |
| Fractional values | `numeric` (allow half-pills) | Real regimens use half-doses; supports the never-wrong-optimistic floor() math | Plan |
| Soft-delete | `archived_at timestamptz` nullable | Preserves *when* archived per FR-005; trivial `IS NULL` active filter | Plan |
| Migration workflow | Committed CLI migration + human-gated `db push` | Version-controlled, reproducible; matches the human-gated-migration posture | Plan |
| Dev DB + typegen | Local stack, `gen types --local` | Fast offline iteration; README already documents `supabase start` | Plan |
| RLS verification | Manual two-user SQL check + typed build | Proves the confidentiality NFR with zero new tooling (no test runner exists) | Plan |
| Foundation scope | Schema + RLS + types only | Keeps F-01 the smallest enabler; query helpers deferred to S-01 | Roadmap |

## Scope

**In scope:** `medications` table + constraints + owner FK + `updated_at` trigger + index; owner-only RLS policies; generated `database.types.ts`; typed `createClient`; `db:types` script; README correction.

**Out of scope:** query/CRUD helpers, `locals.supabase` plumbing, seed data, archive-filter enforcement in the DB, any UI, auth/deploy/CI changes, non-daily dosing, notifications.

## Architecture / Approach

Database-first: a single version-controlled SQL migration is the source of truth for the schema and RLS; the TypeScript `Database` type is a generated artifact derived from it. Develop against the local Supabase stack; promote the identical migration to the cloud project through a human gate (forward-only — it does not roll back with the Worker).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema migration + RLS | `medications` table with owner-only RLS, applied local→cloud | RLS misconfigured → cross-user data leak (mitigated by `default auth.uid()` + `with check` + two-user test) |
| 2. Types + typed client + docs | Generated `database.types.ts`, typed `createClient`, `db:types` script, README fix | Type drift between migration and committed types (mitigated by the `db:types` script) |

**Prerequisites:** Supabase cloud project reachable for the Phase 1 cloud apply (deploy-plan G2 done); Docker running for the local stack. Auth/deploy already present.
**Estimated effort:** Small — roughly one focused session across the two phases.

## Open Risks & Assumptions

- Cloud `db push` is manual and forward-only; it must land before any slice that reads `medications` deploys.
- No automated regression guard on RLS — a future policy change won't be auto-caught; the two-user check must be re-run by hand.
- Assumes development continues against the local stack; switching to cloud-only dev would change the typegen source flag.

## Success Criteria (Summary)

- A signed-in user can only ever read/write their own medication rows (two-user SQL check passes).
- The schema exists in the cloud project with RLS enabled, applied from a committed migration.
- `createClient` is typed and `npm run build` / `lint` / `astro sync` pass against the generated types.
