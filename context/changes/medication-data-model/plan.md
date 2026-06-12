# Medication Data Model — Implementation Plan

## Overview

Establish PillStocker's first database schema: a `medications` table holding one record per medication (per FR-002's "one record, two views" model), protected by **owner-only row-level security** (the enforcement point for the confidentiality NFR), supporting **soft-delete** via `archived_at` (FR-005), and exposed to the app through **generated TypeScript types** wired into the existing Supabase client. This is roadmap foundation **F-01** — the cross-cutting enabler that unlocks the north star S-01 (`runout-forecast`) and every other slice.

## Current State Analysis

- **The domain data layer is empty.** Supabase is wired for **auth only** — `supabase/` contains just `config.toml` (`[db.migrations] enabled = true`, `schema_paths = []`) and `.gitignore`; there is **no `migrations/` directory** and no domain tables. Only Supabase Auth's built-in `auth.users` exists.
- **The Supabase CLI is available** as a devDependency (`supabase@^2.23.4`); `npx supabase …` works. No `db:*` npm scripts exist yet (`package.json` scripts: `dev`, `build`, `deploy`, `preview`, `astro`).
- **The client is untyped and null-safe.** `src/lib/supabase.ts` exports `createClient(headers, cookies)` building a `createServerClient` from `@supabase/ssr`, returning `null` when `SUPABASE_URL`/`SUPABASE_KEY` are missing. Secrets come from `astro:env/server` (declared `optional` in `astro.config.mjs`). `src/middleware.ts` calls it per request and sets `context.locals.user`; `src/env.d.ts` types `App.Locals.user` only.
- **RLS is the real security boundary.** Production runs against a **cloud** Supabase project and `SUPABASE_KEY` is the RLS-respecting **publishable** key (README + deploy-plan), so owner isolation must be enforced in the database, not the app.
- **Migrations are a separate, human-gated step.** Per `infrastructure.md`/`deploy-plan.md`, Supabase schema changes do **not** roll back with `wrangler` and are applied by a human, not CI.
- **No test runner is configured** (CLAUDE.md). Verification is `astro sync` + `build` + `lint` + reasoning, plus manual SQL.

## Desired End State

A `medications` table exists in both the local Supabase stack and the cloud project, with RLS enabled such that an authenticated user can read/write only their own rows and no one else's. `src/lib/database.types.ts` is generated and committed, `createClient` returns a `SupabaseClient<Database>`, and `npm run build` / `lint` / `astro sync` pass with the typed client. A two-user SQL check confirms owner isolation. No medication query/CRUD code is written yet — that lands in S-01.

**Verification of the end state:** `supabase db reset` applies the migration cleanly locally; the two-user RLS SQL check shows user B cannot see user A's rows; `supabase db push` lands the table in the cloud project (RLS on); `npx astro sync && npm run build && npm run lint` succeed against the regenerated types.

### Key Discoveries:

- No migrations dir yet — this is migration #1; the `migrations/` folder is auto-discovered by the CLI, so no `config.toml` change is needed (`src/../supabase/config.toml:53-58`).
- Client factory to extend: `src/lib/supabase.ts:5-24` (`createServerClient` → make generic over `Database`).
- Locals typing lives at `src/env.d.ts` (currently `user` only) — left unchanged this phase (see "What We're NOT Doing").
- README claims "No database tables or migrations are required" (`README.md:116`) — must be corrected.
- `SUPABASE_KEY` is the publishable (RLS-respecting) key — RLS is load-bearing, not cosmetic.

## What We're NOT Doing

- **No query/CRUD helpers** (e.g., `listMedications`, `addMedication`) — those belong to S-01 (`runout-forecast`) and later slices.
- **No `locals.supabase` plumbing** — middleware/`env.d.ts` stay as-is; routes keep calling `createClient()`. A slice can add this if it proves useful.
- **No seed data** — not needed for a foundation; a slice can add fixtures if helpful.
- **No view/query-layer enforcement of the archive filter** — `archived_at IS NULL` filtering is an app-level convention applied by the slices that read the table.
- **No non-daily dosing, configurable thresholds, substance dedup, or notifications** — out of MVP scope per PRD Non-Goals.
- **No changes to auth, deploy, or CI** — auth and deploy are already present (baseline).

## Implementation Approach

Database-first, in dependency order: land the schema + RLS as a version-controlled migration and prove isolation, then generate types and make the app-side client type-aware. Develop against the **local** Supabase stack for fast iteration; promote the identical migration to the **cloud** project through a human gate. The migration is the single source of truth for the schema; types are a generated artifact derived from it.

## Critical Implementation Details

- **RLS without a default owner is a footgun.** Set `user_id` to `default auth.uid()` and `not null`, add an `INSERT` policy with `WITH CHECK (auth.uid() = user_id)`, so a client using the publishable key cannot insert rows owned by someone else even if it omits/forges `user_id`.
- **Apply order is local-first, cloud-by-gate.** Generate types from the local DB only *after* the migration is applied locally; push to cloud is a separate human-approved step and does not roll back with the Worker — do not couple it to a code deploy.

## Phase 1: Schema migration + RLS

### Overview

Author the first migration creating `medications` with constraints, an owner FK, an `updated_at` trigger, an index, and owner-only RLS. Apply locally, prove isolation with a two-user SQL check, then apply to the cloud project behind a human gate.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_create_medications.sql` (timestamp from `supabase migration new create_medications`)

**Intent**: Create the single `medications` record table that backs both the run-out (daily) and expiry (shelf) views, owned per-user and soft-deletable, with database-level guardrails so a row can never describe a wrong-optimistic or negative supply.

**Contract**: Table `public.medications` with columns:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`
- `name text not null` (CHECK `char_length(trim(name)) > 0`)
- `active_substance text`, `description text` (both nullable)
- `pill_count numeric` (nullable; CHECK `pill_count is null or pill_count >= 0`)
- `dose_morning numeric`, `dose_midday numeric`, `dose_night numeric` (all nullable; each CHECK `… is null or … >= 0`)
- `expiry_date date` (nullable)
- `archived_at timestamptz` (nullable; `null` = active)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Plus: index `on medications (user_id)`; an `updated_at` auto-touch trigger (Supabase `moddatetime` extension or a `before update` trigger); `alter table … enable row level security`; and **owner-only policies for the `authenticated` role** — `select`/`update`/`delete` `using (auth.uid() = user_id)` and `insert` `with check (auth.uid() = user_id)` (per-command policies, not a single `FOR ALL`, for auditable security). No code snippet needed beyond this contract — it's standard Supabase DDL.

#### 2. Two-user RLS verification snippet

**File**: `supabase/migrations/` companion check — run ad hoc (not committed as a migration), e.g. via Studio SQL or `psql`

**Intent**: Prove the confidentiality NFR: an authenticated user reads only their own rows.

**Contract**: Insert a row as user A, then under user B's JWT/claims (`set local role authenticated; set local request.jwt.claims = '{"sub":"<B-uuid>"}'`) confirm `select … from medications` returns zero of A's rows, and that B's insert with `user_id = A` is rejected by the `with check`.

### Success Criteria:

#### Automated Verification:

- Local stack starts: `npx supabase start` reports healthy
- Migration applies cleanly: `npx supabase db reset` runs with no error and lists the new migration
- Schema lints clean: `npx supabase db lint`

#### Manual Verification:

- Two-user SQL check: user B cannot `select` user A's rows; B cannot `insert` a row with `user_id = A` (rejected by `with check`)
- Constraint behavior: negative `pill_count`/dose is rejected; empty `name` is rejected; `archived_at IS NULL` distinguishes active rows
- Human-gated cloud apply: `npx supabase link` (cloud project) then `npx supabase db push` succeeds; `medications` is visible in the cloud Studio with RLS **enabled**

**Implementation Note**: After Phase 1 automated verification passes, pause for human confirmation that the two-user RLS check and the cloud `db push` succeeded before starting Phase 2.

---

## Phase 2: Generated types + typed client + docs

### Overview

Generate the TypeScript `Database` type from the local schema, commit it, make `createClient` type-aware, add a regeneration script, and correct the README.

### Changes Required:

#### 1. Generated database types

**File**: `src/lib/database.types.ts` (generated)

**Intent**: Produce the compile-time contract for the `medications` table so slices get typed `.from('medications')` access.

**Contract**: Output of `npx supabase gen types typescript --local` redirected to this file; exports a `Database` type containing `public.medications` Row/Insert/Update shapes. Committed as a generated artifact (regenerated, not hand-edited).

#### 2. `db:types` npm script

**File**: `package.json`

**Intent**: One command to regenerate types after a schema change, so the artifact never drifts silently.

**Contract**: Add `"db:types": "supabase gen types typescript --local > src/lib/database.types.ts"` to `scripts`.

#### 3. Typed client factory

**File**: `src/lib/supabase.ts`

**Intent**: Thread the generated `Database` type through the client so queries are type-checked, without changing the null-safe, server-only behavior.

**Contract**: Import `Database` from `@/lib/database.types`; change `createServerClient(...)` to `createServerClient<Database>(...)`; the function's return type becomes `SupabaseClient<Database> | null`. No behavioral change — env-missing still returns `null`. Preserve the existing cookie adapter and `astro:env/server` import exactly.

#### 4. README correction

**File**: `README.md`

**Intent**: Stop telling readers no tables/migrations exist, and document the migration + typegen workflow.

**Contract**: Replace the "No database tables or migrations are required…" line (`README.md:116`) with a note that the project now has a `medications` schema; add brief steps for `supabase migration new`, `db reset` (local), `db push` (cloud, human-gated), and `npm run db:types`. Prose only.

### Success Criteria:

#### Automated Verification:

- Types regenerate: `npm run db:types` writes a non-empty `src/lib/database.types.ts` containing `medications`
- Astro types sync: `npx astro sync` succeeds
- Build passes with typed client: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `createClient(...)` returns a typed client — `.from('medications')` autocompletes columns; a sample typed `select` compiles
- README no longer claims "no tables/migrations" and describes the migration + `db:types` workflow

**Implementation Note**: After Phase 2 automated verification passes, pause for human confirmation before considering F-01 complete.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured (CLAUDE.md). Correctness is established by schema constraints, RLS, and type-checking.

### Integration Tests:

- The two-user RLS SQL check (Phase 1) is the integration-level proof of owner isolation.

### Manual Testing Steps:

1. `npx supabase start` then `npx supabase db reset` — migration applies cleanly.
2. In Studio SQL: insert a row as user A; switch to user B's JWT claims; confirm B sees none of A's rows and cannot insert as A.
3. Try a negative `pill_count` and an empty `name` — both rejected.
4. `npx supabase db push` to the cloud project (human gate); confirm the table + RLS in cloud Studio.
5. `npm run db:types && npx astro sync && npm run build && npm run lint` — all green.

## Performance Considerations

Negligible at this scale (single-user, low QPS, small data). The `user_id` index keeps per-user RLS scans cheap. Keep the Worker bundle unaffected — types are compile-time only.

## Migration Notes

- The migration is the source of truth; `database.types.ts` is generated from it.
- Cloud apply is **forward-only and human-gated**; it does not roll back with a Worker `wrangler rollback`. Land the schema before any slice that reads it deploys.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01 `medication-data-model`)
- PRD: `context/foundation/prd.md` (FR-002, FR-005, Non-Functional Requirements, Access Control)
- Deploy/infra constraints: `context/foundation/infrastructure.md`, `context/deployment/deploy-plan.md`
- Client to extend: `src/lib/supabase.ts:5-24`; Supabase config: `supabase/config.toml:53-58`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema migration + RLS

#### Automated

- [x] 1.1 Local stack starts: `npx supabase start` reports healthy — 6f42f15
- [x] 1.2 Migration applies cleanly: `npx supabase db reset` runs with no error and lists the new migration — 6f42f15
- [x] 1.3 Schema lints clean: `npx supabase db lint` — 6f42f15

#### Manual

- [x] 1.4 Two-user SQL check: user B cannot select user A's rows; B cannot insert with `user_id = A` — 6f42f15
- [x] 1.5 Constraint behavior: negative pill_count/dose rejected; empty name rejected; `archived_at IS NULL` distinguishes active rows — 6f42f15
- [x] 1.6 Human-gated cloud apply: `npx supabase link` + `npx supabase db push` succeeds; `medications` visible in cloud Studio with RLS enabled — 6f42f15

### Phase 2: Generated types + typed client + docs

#### Automated

- [x] 2.1 Types regenerate: `npm run db:types` writes a non-empty `src/lib/database.types.ts` containing `medications`
- [x] 2.2 Astro types sync: `npx astro sync` succeeds
- [x] 2.3 Build passes with typed client: `npm run build`
- [x] 2.4 Lint passes: `npm run lint`

#### Manual

- [x] 2.5 `createClient(...)` returns a typed client — `.from('medications')` autocompletes; a sample typed select compiles
- [x] 2.6 README no longer claims "no tables/migrations" and describes the migration + `db:types` workflow
