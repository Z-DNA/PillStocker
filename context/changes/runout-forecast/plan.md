# Run-out Forecast (S-01) Implementation Plan

## Overview

S-01 `runout-forecast` is the project's **north star**: the first user-visible vertical slice on top of the F-01 `medications` schema. A signed-in user adds a medication (name + pill count + morning/midday/night dosing, plus optional active substance and description), then opens `/medications` and sees every active medication with its **predicted run-out date**, **days-left**, and a **proximity colour** (green ≥14 / yellow 7–13 / red <7), ordered soonest-run-out first. This exercises the full stack top-to-bottom on the product wedge — package-count ÷ multi-time-of-day dosing forecasting — and is the validation milestone for the PRD's primary Success Criterion.

PRD refs: US-01, FR-001, FR-002, FR-006, FR-007, FR-008.

## Current State Analysis

- **Schema is live, access code is empty.** F-01 shipped `public.medications` (one record: `name`, optional `active_substance`, `description`, `pill_count`, `dose_morning/midday/night`, `expiry_date`, `archived_at`) with owner-only RLS and generated types in `src/lib/database.types.ts`. There are **zero query/CRUD helpers** — S-01 writes the first read/write code against this table. (`supabase/migrations/20260612121806_create_medications.sql`)
- **Numeric, half-pill-capable columns.** `pill_count` and the three dose columns are `numeric` with `>= 0` (or null) check constraints. Run-out math must tolerate fractional values.
- **Established form pattern to mirror.** `SignInForm.tsx` (`client:load` React island, controlled inputs, client validation that only `preventDefault`s) → native `<form method="POST" action="/api/...">` → handler in `src/pages/api/auth/signin.ts` calls `createClient()`, does the work, and `context.redirect`s back with `?error=...`. Pages embed the island via `signin.astro`. UI uses `FormField` (`src/components/auth/FormField.tsx`) and the CVA `Button` (`src/components/ui/button.tsx`).
- **Supabase access is re-created per request.** `createClient(headers, cookies)` returns `SupabaseClient<Database> | null` (`src/lib/supabase.ts`). `locals` carries only `user`, not `supabase` (`src/env.d.ts`) — every page/handler calls `createClient` itself. We follow this; no `locals.supabase` plumbing.
- **Routing & gating.** `src/middleware.ts` sets `locals.user` and gates `PROTECTED_ROUTES = ["/dashboard"]` via `startsWith`, redirecting to `/auth/signin`. `/api/*` paths are NOT matched by that prefix, so API routes guard themselves (per CLAUDE.md convention). `output: "server"`, Cloudflare adapter (`astro.config.mjs`).
- **`/dashboard` is a placeholder** ("Welcome, {email}"); post-signin currently redirects to `/` (`src/pages/api/auth/signin.ts:19`). Neither has medication UI.
- **No test runner** (`npm test` does not exist). Verification is `astro sync` → `npm run build`/`lint` plus manual UI checks.

### Key Discoveries:

- Guardrail (PRD §Success Criteria, roadmap S-01): days-of-supply must **`floor()`, never round up** — a false "green/safe" is a regression. This invariant lives in the forecast function (Phase 1).
- `src/pages/api/auth/signin.ts:19` redirects to `/` post-login — retargeted to `/medications` in Phase 2.
- RLS `with check ((select auth.uid()) = user_id)` + `user_id default auth.uid()` (migration L13, L59-62) means inserts are owner-bound by the DB; the API route sets `user_id` explicitly from `locals.user.id` for clarity.
- Lessons register (`context/foundation/lessons.md`): only relevant if `db:types` is regenerated — S-01 does **not** change the schema, so no regeneration and that lesson does not bite.

## Desired End State

A signed-in user visits `/medications` (the post-login landing) and:
- with no meds yet, sees an empty state with an "Add your first medication" call-to-action;
- can open `/medications/new`, fill the add form, submit, and land back on `/medications` with the new med visible;
- sees each active med as a colour-coded row showing its run-out date and "N days left", ordered soonest-first, with **"Out now"** (0 days / 0 pills) pinned at the very top and **"No forecast"** (no count or no dosing) rows neutral and last.

Verify: `astro sync && npm run build && npm run lint` pass; the three manual scenarios above behave as described against a locally-configured Supabase + auth; the floor guardrail holds (10 pills at 1/1/1 dosing shows exactly **3** days, not 4).

## What We're NOT Doing

- **Expiry / shelf view** (S-02) — no `expiry_date` field in the S-01 add form, no expiry flagging.
- **Refill, edit, archive** (S-03) — the S-01 list is read + add only; no per-row actions, no soft-delete UI (the query still filters `archived_at IS NULL`).
- **Summary landing counts** (S-04) — `/dashboard` is freed (redirects to `/medications`) but not built into a summary.
- **Out-of-app notifications** (FR-009/US-03, v2), **configurable thresholds** (FR-012), **substance duplicate detection** (FR-013), **non-daily dosing** — all out of MVP scope.
- **No `locals.supabase` plumbing**, no pagination/sort options, no new test runner.

## Implementation Approach

Three phases following the data → logic → read → write grain, each independently verifiable:

1. **Pure logic + access helpers** first, so the guardrail (`floor`) and status banding are reviewable in isolation and the downstream phases consume a settled contract.
2. **Read path** (`/medications` list + routing/redirects) next — verifiable by seeding rows in Supabase Studio, before any write code exists.
3. **Write path** (add page + form + API) last — closes the loop and lets the add flow be verified against the already-working list.

The add flow copies the auth pattern exactly (React island → native POST → server handler → redirect with `?error=`), so no new client-side data-fetching pattern is introduced.

## Critical Implementation Details

- **Guardrail invariant (load-bearing).** `daysLeft = Math.floor(pillCount / totalDailyDose)`; `daysLeft <= 0 ⇒ status "out"`. Never `round`/`ceil`. A null `pill_count` **or** a `totalDailyDose <= 0` yields status `"none"` (No forecast) — not a zero-day forecast. Doses that are `null` count as `0` in the sum; a med with one dose set and the others null forecasts from that one dose.
- **API route self-guards.** `/api/medications` is under `/api/`, so the `PROTECTED_ROUTES` `startsWith("/medications")` prefix does **not** cover it. The handler must check `locals.user` itself and own its error responses, mirroring `/api/auth/*`.
- **Insert ownership.** Set `user_id` explicitly from `context.locals.user.id` on insert; RLS `with check` enforces it equals `auth.uid()`.
- **Empty numeric fields must become `null`, not `0` (parsing trap).** `Number("") === 0` (and `Number(" ") === 0`), so test each numeric field for empty/blank **before** calling `Number()`. If a blank `pill_count` were stored as `0`, a med with dosing but no entered count would forecast `floor(0/dose) = 0` → "Out now" instead of "No forecast" — breaking the count-less edge case (and `computeRunout` correctly keys "none" on `pill_count == null`, so the `null` must survive parsing). A blank dose is "unspecified", not `0`.
- **"Today" is computed once, server-side, at date granularity** (UTC). Days-left and run-out date are date-granular; a sub-24h timezone off-by-one is an accepted MVP risk (noted in Open Risks).

## Phase 1: Forecast logic + data-access helpers

### Overview

Build the pure forecast module (the guardrail lives here), the typed query/create helpers, and the shared input/view types. No UI, no routing.

### Changes Required:

#### 1. Forecast module

**File**: `src/lib/medications/forecast.ts`

**Intent**: One pure function that turns a medication row + "today" into a run-out classification, plus a comparator that orders meds soonest-first with "No forecast" last. This is the single home of the never-wrong-optimistic guardrail.

**Contract**:
- `type RunoutStatus = "out" | "critical" | "warning" | "safe" | "none"`
- `interface RunoutForecast { status: RunoutStatus; daysLeft: number | null; runOutDate: Date | null; totalDailyDose: number }`
- `computeRunout(med: Pick<MedicationRow, "pill_count" | "dose_morning" | "dose_midday" | "dose_night">, today: Date): RunoutForecast` — `totalDailyDose` = sum of the three doses (null→0); if `pill_count == null || totalDailyDose <= 0` → `status "none"`, `daysLeft`/`runOutDate` null; else `daysLeft = Math.floor(pill_count / totalDailyDose)`, `runOutDate = today + daysLeft days`, status banded: `<= 0 → "out"`, `< 7 → "critical"`, `< 14 → "warning"`, else `"safe"`.
- `compareByRunout(a: RunoutForecast, b: RunoutForecast): number` — forecastable rows (status ≠ `"none"`) ordered by ascending `daysLeft` (so `"out"`/0 sits first); `"none"` rows sort last. `MedicationRow` = `Tables<"medications">` from `@/lib/database.types`.

#### 2. Query + create helpers

**File**: `src/lib/medications/queries.ts`

**Intent**: Typed read of the current user's active meds and a typed insert, so pages/handlers don't hand-write Supabase calls. RLS scopes both to the owner.

**Contract**:
- `getActiveMedications(supabase: SupabaseClient<Database>): Promise<MedicationRow[]>` — `select("*").is("archived_at", null)` (order is irrelevant; forecast sort happens in the view). On a Supabase/Postgrest error, **throw** (don't swallow to `[]`) so the page can distinguish "no meds" from "query failed"; on success return the rows.
- `interface NewMedicationInput { name: string; active_substance: string | null; description: string | null; pill_count: number | null; dose_morning: number | null; dose_midday: number | null; dose_night: number | null }`
- `createMedication(supabase, userId: string, input: NewMedicationInput): Promise<{ error: PostgrestError | null }>` — inserts one row with `user_id: userId`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` regenerates types without error
- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- Review `computeRunout` against the guardrail spec table: 10 pills @ (1+1+1) → `daysLeft 3` / `critical`; 1 pill @ 2/day → `0` / `out`; 28 pills @ 2/day → `14` / `safe`; 13 days → `warning`; 6 days → `critical`; pill_count null OR all doses null → `none`.
- Confirm no `round`/`ceil`/`Math.round` anywhere in `forecast.ts` (floor-only).

**Implementation Note**: After automated verification passes, pause for human confirmation of the guardrail review before Phase 2.

---

## Phase 2: Run-out list view + routing (read path)

### Overview

Build the `/medications` SSR list that queries active meds, forecasts and sorts them, and renders colour-coded rows with an empty state. Wire route protection and redirect `/dashboard` + post-signin to it. Verifiable by seeding rows in Supabase Studio — no write code yet.

### Changes Required:

#### 1. Medication row component

**File**: `src/components/medications/MedicationCard.astro`

**Intent**: Render one medication's name, run-out date + "N days left" (or "Out now" / "No forecast"), styled by its status colour band. Owns the Tailwind class mapping; consumes the `RunoutStatus` enum from logic.

**Contract**: Props `{ med: MedicationRow; forecast: RunoutForecast }`. A status→presentation map (label + colour classes) covers `out` ("Out now", red, emphasised), `critical` (red), `warning` (yellow/amber), `safe` (green), `none` ("No forecast", neutral/grey). Shows `med.name`; for forecastable rows the formatted `runOutDate` and `daysLeft`; substance/description may render as secondary text. Matches the existing dark glass card styling used in `dashboard.astro`/`signin.astro`.

#### 2. Run-out list page

**File**: `src/pages/medications/index.astro`

**Intent**: The daily run-out view and post-login landing. Loads active meds, computes each forecast against a single "today", sorts soonest-first, renders the list (or empty state) and an "Add medication" link to `/medications/new`.

**Contract**: Frontmatter reads `Astro.locals.user`; `createClient(...)` (null → config-error fallback); `meds = await getActiveMedications(supabase)` wrapped in try/catch — on a thrown query error, render an error state (reuse `Banner.astro` error variant) rather than a silent empty list. On success: build `{ med, forecast: computeRunout(med, today) }[]`, sort with `compareByRunout`. Empty state ("Add your first medication" CTA) when there are zero active meds. Links to `/medications/new`.

#### 3. Protect the medication routes

**File**: `src/middleware.ts`

**Intent**: Gate the new pages behind auth.

**Contract**: Add `"/medications"` to `PROTECTED_ROUTES` (covers `/medications` and `/medications/new` via the existing `startsWith`).

#### 4. Redirect dashboard + post-signin to the list; repoint nav

**File**: `src/pages/dashboard.astro`, `src/pages/api/auth/signin.ts`, `src/components/Topbar.astro`

**Intent**: Make `/medications` the authenticated landing; free `/dashboard` for the future S-04 summary; point the nav at the real page rather than through the redirect hop.

**Contract**: `dashboard.astro` frontmatter `return Astro.redirect("/medications")`. In `signin.ts`, change the success `context.redirect("/")` to `context.redirect("/medications")`. In `Topbar.astro` (the `<a href="/dashboard">Dashboard</a>` at ~line 13, rendered whenever a user is set — including on the public `/`), repoint the link to `/medications` and relabel it "Medications".

### Success Criteria:

#### Automated Verification:

- `npx astro sync` passes
- `npm run build` passes
- `npm run lint` passes
- `"/medications"` present in `PROTECTED_ROUTES` (grep `src/middleware.ts`)

#### Manual Verification:

- Unauthenticated GET `/medications` → redirected to `/auth/signin`.
- Signed-in user with no meds → empty state with the add CTA.
- Seed (Supabase Studio) a med with count + dosing → row shows correct colour, run-out date, and days-left.
- Seed a 0-pill (or count < daily dose) med → "Out now", pinned top.
- Seed a name-only med (no count/dosing) → "No forecast", sorted last.
- Seed several meds → ordered soonest-run-out first.
- `/dashboard` redirects to `/medications`; signing in lands on `/medications`.
- Topbar "Medications" link navigates directly to `/medications` (no `/dashboard` hop).

**Implementation Note**: After automated verification passes, pause for human confirmation of the seeded-row scenarios before Phase 3.

---

## Phase 3: Add-medication flow (write path)

### Overview

Add the `/medications/new` page, the `AddMedicationForm` React island, and the self-guarding `POST /api/medications` handler. Closes the loop: a user adds a med through the UI and sees it forecasted in the list.

### Changes Required:

#### 1. Add-medication form (React island)

**File**: `src/components/medications/AddMedicationForm.tsx`

**Intent**: Controlled form mirroring `SignInForm` — collects name (required), pill count, morning/midday/night doses, active substance, description; client-side validates; submits as a native POST.

**Contract**: `Props { serverError?: string | null }`. Native `<form method="POST" action="/api/medications">`. Reuses `FormField` for text inputs and number inputs for count/doses (the three doses grouped on one row). Client validation: name non-blank; numeric fields non-negative when present (invalid → `preventDefault`, show inline error). Renders `serverError` via the `ServerError` component pattern. Field `name` attributes map to the form keys the API reads.

#### 2. Add-medication page

**File**: `src/pages/medications/new.astro`

**Intent**: Host the add form, mirroring `signin.astro`.

**Contract**: Reads `?error` from `Astro.url.searchParams`; renders `<AddMedicationForm serverError={error} client:load />` inside the shared Layout/card. Protected via the Phase 2 middleware entry.

#### 3. Create-medication API handler

**File**: `src/pages/api/medications/index.ts`

**Intent**: Validate and persist a new medication, then redirect; self-guards auth and owns its error responses (not covered by `PROTECTED_ROUTES`).

**Contract**: `export const POST: APIRoute`. Guard `createClient` (null → redirect `/medications/new?error=...`) and `context.locals.user` (null → redirect `/auth/signin`). Parse `formData`: trim `name` (blank → redirect back with `?error=`); empty/blank numeric fields → `null` — test for empty **before** `Number()` (since `Number("") === 0` would store a false `0`, see Critical Implementation Details); non-empty values `Number()`-parsed and rejected if `NaN` or `< 0`; substance/description empty → `null`. Call `createMedication(supabase, locals.user.id, input)`; on error redirect `/medications/new?error=<message>`; on success `context.redirect("/medications")`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` passes
- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- Add a med with count + dosing via the UI → redirected to `/medications`, med appears with the correct colour/date/days-left.
- Add a name-only med → saved, shows "No forecast".
- Add a med with 0 pills → shows "Out now" at the top.
- Submit a blank name → rejected by client validation; bypassing the client (e.g. direct POST) → server redirects back with an error.
- Submit a negative number → rejected.
- Guardrail spot-check through the UI: 10 pills with 1/1/1 dosing shows exactly **3 days left** (critical), never 4.
- Add a med with dosing but a **blank pill count** → shows "No forecast", not "Out now" (empty-vs-zero parsing).

**Implementation Note**: After automated verification passes, pause for human confirmation of the add-flow scenarios.

---

## Testing Strategy

No test runner is configured (per CLAUDE.md); verification is build/lint + manual.

### Logic checks (Phase 1, by review):

- `floor` guardrail and status bands per the spec table above.
- `"none"` for missing count or zero total dose; `"out"` for `daysLeft <= 0`.

### Manual Testing Steps (end-to-end, after Phase 3):

1. Sign in → land on `/medications` (empty state on a fresh account).
2. Add a med (e.g. 30 pills, 1/0/1 dosing) → see ~15 days, green, on the list.
3. Add a near-empty med (3 pills, 1/1/1) → 1 day, red, sorts above the green one.
4. Add a 0-pill med → "Out now", pinned top.
5. Add a name-only med → "No forecast", bottom.
6. Confirm soonest-first ordering across all rows.

## Performance Considerations

Single owner-scoped query (`medications_user_id_idx` exists) over a small per-user list; forecast + sort are O(n) in memory. No performance concern at MVP scale (PRD `data_volume: small`).

## Migration Notes

None — S-01 adds no schema changes and regenerates no types. It reads/writes the existing F-01 table.

> Operational dependency (roadmap S-01 unknown): auth is code-present but operationally inactive until Worker secrets (`SUPABASE_URL`/`SUPABASE_KEY`) and Supabase Auth URLs (deploy-plan G3/G4) are set. Manual verification requires a locally-configured Supabase + a confirmed user (`.env`/`.dev.vars` set, local stack running).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (US-01, FR-001/002/006/007/008, Business Logic, Success Criteria guardrail)
- F-01 schema: `supabase/migrations/20260612121806_create_medications.sql`; types `src/lib/database.types.ts`
- Pattern to mirror: `src/components/auth/SignInForm.tsx`, `src/pages/api/auth/signin.ts`, `src/pages/auth/signin.astro`
- Load-bearing names registry to update during implementation: `docs/reference/contract-surfaces.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Forecast logic + data-access helpers

#### Automated

- [x] 1.1 `npx astro sync` regenerates types without error — 19794bd
- [x] 1.2 `npm run build` passes — 19794bd
- [x] 1.3 `npm run lint` passes — 19794bd

#### Manual

- [x] 1.4 Review `computeRunout` against the guardrail spec table — 19794bd
- [x] 1.5 Confirm floor-only (no round/ceil) in `forecast.ts` — 19794bd

### Phase 2: Run-out list view + routing (read path)

#### Automated

- [x] 2.1 `npx astro sync` passes
- [x] 2.2 `npm run build` passes
- [x] 2.3 `npm run lint` passes
- [x] 2.4 `"/medications"` present in `PROTECTED_ROUTES`

#### Manual

- [x] 2.5 Unauthenticated `/medications` redirects to `/auth/signin`
- [x] 2.6 Empty state with add CTA when no meds
- [x] 2.7 Seeded count+dosing med shows correct colour/date/days-left
- [x] 2.8 Seeded 0-pill med shows "Out now", pinned top
- [x] 2.9 Seeded name-only med shows "No forecast", sorted last
- [x] 2.10 Multiple meds ordered soonest-run-out first
- [x] 2.11 `/dashboard` and post-signin land on `/medications`
- [x] 2.12 Topbar "Medications" link points to `/medications`

### Phase 3: Add-medication flow (write path)

#### Automated

- [ ] 3.1 `npx astro sync` passes
- [ ] 3.2 `npm run build` passes
- [ ] 3.3 `npm run lint` passes

#### Manual

- [ ] 3.4 Add med with count+dosing → appears forecasted on the list
- [ ] 3.5 Name-only add → shows "No forecast"
- [ ] 3.6 0-pill add → shows "Out now"
- [ ] 3.7 Blank name rejected (client + server)
- [ ] 3.8 Negative number rejected
- [ ] 3.9 Guardrail spot-check: 10 pills @ 1/1/1 → exactly 3 days left
- [ ] 3.10 Dosing but blank count → "No forecast", not "Out now"
