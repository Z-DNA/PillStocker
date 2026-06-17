# Expiry Shelf (S-02) Implementation Plan

## Overview

S-02 `expiry-shelf` adds the **second view over the same medication list**: a signed-in user records an optional **expiry date** on a medication, then opens a **shelf view** (`/medications/shelf`) that flags every dated medication as **Expired**, **Soon** (within 90 days), or **OK**, colour-coded and ordered **soonest-expiry first**. It reuses the F-01 `medications` schema (the `expiry_date` column already exists) and mirrors the S-01 run-out vertical layer-for-layer. The run-out (daily) view is left untouched; editing an expiry date later is S-03's job.

PRD refs: US-02, FR-002 (expiry as an optional attribute of the one record), FR-010.

## Current State Analysis

- **Schema is ready; the column is unused.** F-01 shipped `public.medications` with `expiry_date date` (nullable) and `archived_at timestamptz` already in place (`supabase/migrations/20260612121806_create_medications.sql`). `MedicationRow = Tables<"medications">` already includes `expiry_date`, so **no migration and no `db:types` regen** — the lessons-register db:types rule does not apply (same as S-01).
- **S-01 is an exact template to mirror.** The run-out vertical gives a 1:1 analogue for every layer:
  - Pure logic + guardrail + comparator: `src/lib/medications/forecast.ts` (`computeRunout`, `compareByRunout`).
  - Status→presentation card: `src/components/medications/MedicationCard.astro` (a `Record<Status, {label,badge,border,tint,accent}>` map over the dark-glass card).
  - SSR list page with empty state + error banner + sort: `src/pages/medications/index.astro:18-28`.
  - Add vertical: `AddMedicationForm.tsx` → native POST → `src/pages/api/medications/index.ts` → `createMedication` with `NewMedicationInput` (`src/lib/medications/queries.ts:6-14`).
- **The data read already returns expiry.** `getActiveMedications` does `select("*").is("archived_at", null)` (`queries.ts:21-27`), so it already returns `expiry_date` — the shelf can reuse it and filter in memory; no new query needed.
- **Routing is free.** `/medications/shelf` is covered by the existing `PROTECTED_ROUTES` `startsWith("/medications")` prefix (`src/middleware.ts:4,24`) — no middleware change.
- **The add form forwards an input `type`.** `FormField` is already used with `type="number"` (`AddMedicationForm.tsx:84`), so `type="date"` works the same way.
- **No test runner** (`npm test` does not exist). Verification is `astro sync` → `npm run build`/`lint` plus manual UI checks against a locally-configured Supabase.

### Key Discoveries:

- Guardrail (US-02 AC4, roadmap S-02): the expiry status must **never show more time remaining than the expiry date allows** — the date-comparison analogue of S-01's floor rule. `daysUntil` is computed at **date granularity** and never rounded up. This invariant lives in the expiry module.
- Fixed thresholds, not configurable (FR-012 deferred): "Soon" = expiry within **90 days** (`0 ≤ daysUntil ≤ 90`); "Expired" = `daysUntil < 0`; "OK" = `daysUntil > 90`. The 7/14-day run-out bands do not transfer — meds expire on a months/years scale.
- New `ExpiryCard.astro` (not an edit to `MedicationCard.astro`) keeps S-02 off the run-out card that S-03 will modify for per-row actions — minimizing the cross-slice collision flagged for the S-02 ∥ S-03 pairing.
- `expiry_date` is a SQL `date`; store/read it as a `"YYYY-MM-DD"` string (Supabase accepts an ISO date string; `<input type="date">` emits exactly that).

## Desired End State

A signed-in user can:
- open `/medications/shelf` and, with no dated meds, see an empty state with an "Add a medication" CTA;
- add a medication with an expiry date via the existing add form, then see it on the shelf with the correct colour band, formatted date, and a relative phrase ("Expires in N days" / "Expired N days ago"), ordered soonest-expiry first with already-expired meds pinned at the top;
- reach the shelf from a Topbar "Shelf" link; meds without an expiry date never appear on the shelf (they remain in the run-out view, which is unchanged).

Verify: `astro sync && npm run build && npm run lint` pass; the manual scenarios behave as described against a locally-configured Supabase + auth; the guardrail holds (a med expiring in 5 days 23h shows **5 days**, never 6; a med expiring today shows "Soon"/0, not "Expired").

## What We're NOT Doing

- **Editing / changing an expiry date** (FR-004) — S-03. The only way to set expiry in S-02 is at add time; correcting it means re-adding until S-03 ships (same MVP gap as count/dosing today).
- **Summary counts of "expiring soon"** (FR-011) — S-04. S-02 builds the classifier S-04 will consume, but no summary screen here.
- **Changing the run-out (daily) view** — `/medications` and `MedicationCard.astro` are untouched; expiry is its own shelf view.
- **Configurable thresholds** (FR-012), **two-tier "soon" bands**, **expiry notifications** (FR-009/Open Q3, v2) — out of MVP scope.
- **A dedicated shelf query / DB-side expiry filter** — reuse `getActiveMedications` and filter `expiry_date !== null` in memory (PRD `data_volume: small`); avoids extra churn in `queries.ts` that S-03 also edits.
- **No `locals.supabase` plumbing**, no new test runner, no `middleware.ts` change.

## Implementation Approach

Two phases, mirroring S-01's data→logic→read→write grain (compressed: the expiry logic is small and the shelf is its only consumer, so they share a phase):

1. **Expiry logic + shelf view (read path)** — the pure classifier (guardrail's home), the new expiry card, the shelf page, and the nav link. Verifiable by seeding `expiry_date` values in Supabase Studio, before any write code exists.
2. **Add-path expiry field (write path)** — thread `expiry_date` through the create contract, the API parse, and the add form. Closes the loop: add a dated med through the UI and see it on the shelf.

The add flow extends the existing S-01 form (one optional field), per FR-002's "Daily and Shelf are views over one list, not separate add flows."

## Critical Implementation Details

- **Guardrail invariant (load-bearing).** `daysUntil` must be computed at date granularity so a sub-24h remainder never inflates the count (never wrong-optimistic). Construct both `today` and `expiry_date` as **UTC midnight** and integer-difference in whole days — this avoids DST half-day drift that a naive millisecond diff with `Math.round` could introduce:
  ```ts
  const dayMs = 86_400_000;
  const toUtcDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const daysUntil = Math.round((toUtcExpiry - toUtcToday) / dayMs); // both are exact UTC midnights → integer
  ```
  `expired` iff `daysUntil < 0`; a med expiring **today** (`daysUntil === 0`) is "Soon", not expired — showing 0 days remaining never overstates supply.
- **"Today" computed once, server-side, date-granular.** As in S-01, a sub-24h timezone off-by-one is an accepted MVP risk. Parse the row's `expiry_date` string as a date-only value (it has no time component); do not let a `new Date("YYYY-MM-DD")` UTC-vs-local interpretation shift the day — construct from the date parts.
- **`expiry_date` is a `date` string end-to-end.** `<input type="date">` emits `"YYYY-MM-DD"`; store it as that string (`NewMedicationInput.expiry_date: string | null`); Supabase persists it to the `date` column. Empty field → `null`.

## Phase 1: Expiry classification logic + shelf view (read path)

### Overview

Build the pure expiry-classification module (guardrail lives here), the new expiry card, the shelf page that queries active meds and renders the dated ones sorted soonest-expiry-first, and the Topbar link. No write code — verifiable by seeding `expiry_date` in Supabase Studio.

### Changes Required:

#### 1. Expiry module

**File**: `src/lib/medications/expiry.ts`

**Intent**: One pure function that turns an expiry date + "today" into a classification, plus a comparator that orders meds soonest-expiry first (expired at the top). The single home of the never-overstate guardrail. Mirrors `forecast.ts`.

**Contract**:
- `type ExpiryStatus = "expired" | "soon" | "ok"`
- `interface ExpiryClassification { status: ExpiryStatus; daysUntil: number; expiryDate: Date }`
- `const EXPIRY_SOON_DAYS = 90` — fixed default (FR-012 deferred).
- `classifyExpiry(expiryDate: Date, today: Date): ExpiryClassification` — `daysUntil` = whole-day UTC-midnight difference (see Critical Implementation Details). Bands: `daysUntil < 0 → "expired"`; `daysUntil <= EXPIRY_SOON_DAYS → "soon"` (includes `0` = expires today); else `"ok"`.
- `compareByExpiry(a: ExpiryClassification, b: ExpiryClassification): number` — ascending `daysUntil` (most-negative/expired first, then soonest).

#### 2. Expiry card component

**File**: `src/components/medications/ExpiryCard.astro` (new)

**Intent**: Render one dated medication's name, formatted expiry date, and a relative phrase, styled by its `ExpiryStatus` colour band. A new component (not an edit to `MedicationCard.astro`) so S-02 never touches the run-out card.

**Contract**: Props `{ med: MedicationRow; expiry: ExpiryClassification }`. A `Record<ExpiryStatus, {label, badge, border, tint, accent}>` presentation map mirroring `MedicationCard.astro`'s structure and dark-glass styling: `expired` (red, emphasised — like the run-out "out" treatment), `soon` (amber), `ok` (green). Shows `med.name` (+ optional `active_substance`/`description` as secondary text, as in `MedicationCard`), the formatted `expiry.expiryDate`, and a relative phrase derived from `daysUntil`: future → "Expires in N days" (and "Expires today" at 0); past → "Expired N days ago" (and "Expired yesterday" at −1). Pluralize "day"/"days".

#### 3. Shelf page

**File**: `src/pages/medications/shelf.astro` (new)

**Intent**: The expiry shelf view. Loads active meds, keeps the ones with an expiry date, classifies each against a single server-side "today", sorts soonest-expiry first, and renders the list (or empty state). Mirrors `index.astro`.

**Contract**: Frontmatter: `createClient(...)` (null → config-error fallback via `Banner` error variant); `meds = await getActiveMedications(supabase)` wrapped in try/catch — on a thrown query error render the error banner rather than a silent empty list. Filter `med.expiry_date !== null`, build `{ med, expiry: classifyExpiry(<parsed date>, today) }[]`, sort with `compareByExpiry`. Empty state ("No medications with an expiry date yet" + CTA linking to `/medications/new`) when none. Include `Topbar`; the header carries an "Add medication" CTA linking to `/medications/new?from=shelf` (origin token consumed in Phase 2 §4). View-to-view navigation is via the Topbar links, not a per-page back button. Page title "Shelf".

#### 4. Topbar shelf link

**File**: `src/components/Topbar.astro`

**Intent**: Add a "Shelf" nav link so signed-in users can reach the expiry view.

**Contract**: In the authenticated branch's nav group (`<div class="flex items-center gap-3">`, ~line 12), add an `<a href="/medications/shelf">Shelf</a>` styled like the existing "Medications" link. (S-04 will later add a summary link to the same group.)

### Success Criteria:

#### Automated Verification:

- `npx astro sync` regenerates types without error
- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- Review `classifyExpiry` against a spec table: today+100d → `ok`; today+90d → `soon`; today+10d → `soon`; today (0) → `soon`; yesterday (−1) → `expired`; a med expiring in 5 days 23h → `daysUntil 5` (no round-up).
- Confirm date-granular diff: no `ceil`/`Math.round`-on-raw-ms inflating `daysUntil` (UTC-midnight integer diff only) — the guardrail.
- Seed (Supabase Studio) a med with expiry ~30 days out → shelf shows amber "Soon", "Expires in ~30 days".
- Seed an already-expired med → red "Expired", pinned top.
- Seed a med with expiry >90 days out → green "OK".
- Seed several dated meds → ordered soonest-expiry first (expired first).
- Seed a med with NO `expiry_date` → does NOT appear on the shelf.
- Empty state shows when no dated meds exist; Topbar "Shelf" link navigates to `/medications/shelf`; the run-out `/medications` view is unchanged.

**Implementation Note**: After automated verification passes, pause for human confirmation of the guardrail review and the seeded-row scenarios before Phase 2.

---

## Phase 2: Add-path expiry field (write path)

### Overview

Thread an optional `expiry_date` through the create contract, the API handler, and the add form, so a user can record an expiry date when adding a medication and see it on the shelf. Closes the loop.

### Changes Required:

#### 1. Create-input contract

**File**: `src/lib/medications/queries.ts`

**Intent**: Extend the insert contract with the optional expiry date. `createMedication` already inserts `{ user_id, ...input }`, so no function-body change is needed beyond the new field.

**Contract**: Add `expiry_date: string | null` to `NewMedicationInput` (a `"YYYY-MM-DD"` string for the `date` column). No change to `getActiveMedications` or the `createMedication` body.

#### 2. API parse

**File**: `src/pages/api/medications/index.ts`

**Intent**: Read the `expiry_date` form field, normalize empty → `null`, and include it in the `NewMedicationInput`. Past dates are allowed (no rejection).

**Contract**: Add an `optionalDate(form.get("expiry_date"))` step (trim; empty → `null`; non-empty → the string). Defense-in-depth: if non-empty and `Number.isNaN(Date.parse(value))`, redirect back with `?error=` (the field is a native date input, so this is a guard, not the primary validation). Add `expiry_date` to the `input` object passed to `createMedication`. No past-date check.

#### 3. Add-form expiry field

**File**: `src/components/medications/AddMedicationForm.tsx`

**Intent**: Add an optional expiry-date input so users can record expiry at add time, mirroring the existing `FormField` usage.

**Contract**: Add `expiry_date: string` to `Values` and `EMPTY`. Render a `FormField` with `type="date"`, label "Expiry date", `id`/name `expiry_date`, an optional lucide icon (e.g. `CalendarClock`), and a hint ("Leave blank if you're not tracking expiry for this medication"). Do **not** add it to `NUMERIC_FIELDS`; no client validation beyond the native date control (past dates allowed). The field `name` must be `expiry_date` to match the API.

#### 4. Return-to-origin redirect

**Files**: `src/pages/medications/new.astro`, `src/components/medications/AddMedicationForm.tsx`, `src/pages/api/medications/index.ts`

**Intent** (added 2026-06-17, user request): after a successful add, return the user to the view they launched from — the shelf if they came from `/medications/shelf`, otherwise the run-out list. The shelf's "Add medication" link already carries `?from=shelf` (Phase 1).

**Contract**: A symbolic origin **token** is threaded through, never a raw URL (no open-redirect surface). `new.astro` reads `from = Astro.url.searchParams.get("from")`, passes `from={from}` to `<AddMedicationForm>`, and makes its "Back to medications" link origin-aware (`from === "shelf"` → `/medications/shelf`, else `/medications`). `AddMedicationForm` takes a `from?: string | null` prop and renders a hidden `<input name="from">`. The API maps the token via a whitelist helper `returnPathFor(from)` (`"shelf"` → `/medications/shelf`, else `/medications`) and uses it for the success redirect; every error redirect back to `/medications/new` also appends `&from=<token>` so the origin survives the round-trip. The run-out view (`index.astro`) is unchanged — no token means the default `/medications`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` passes
- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- Add a med with an expiry date via the UI → redirected to `/medications`; open `/medications/shelf` → the med appears with the correct band, formatted date, and relative phrase.
- Add a med with an expiry ~30–90 days out → "Soon" (amber).
- Add a med with a past expiry date → "Expired" (red), pinned top.
- Add a med with no expiry date → does NOT appear on the shelf, but still appears on the run-out view as before.
- Existing add flow unaffected: count/dosing still save; blank name still rejected (client + server); negative numbers still rejected.
- Add launched from the shelf ("Add medication" on `/medications/shelf`) → after save, lands back on `/medications/shelf`.
- Add launched from the run-out view or directly via `/medications/new` → after save, lands on `/medications` (default).

**Implementation Note**: After automated verification passes, pause for human confirmation of the add-flow scenarios.

---

## Testing Strategy

No test runner is configured (per CLAUDE.md); verification is build/lint + manual.

### Logic checks (Phase 1, by review):

- Band boundaries per the spec table: `< 0` expired, `0..90` soon, `> 90` ok.
- Date-granular `daysUntil` with no round-up (the guardrail); `daysUntil === 0` is "Soon", not "Expired".

### Manual Testing Steps (end-to-end, after Phase 2):

1. Sign in → open `/medications/shelf` (empty state on a fresh account).
2. Add a med with an expiry ~45 days out → shelf shows amber "Soon", "Expires in ~45 days".
3. Add a med expiring next week → "Soon", sorts above the 45-day one.
4. Add a med with a past expiry → "Expired", pinned top.
5. Add a med with an expiry >90 days out → green "OK", sorts last.
6. Add a name-only med (no expiry) → absent from the shelf; present on the run-out view.
7. Confirm soonest-expiry-first ordering across all rows.

## Performance Considerations

Single owner-scoped query (`medications_user_id_idx` exists), reused from S-01; filter + classify + sort are O(n) in memory over a small per-user list. No performance concern at MVP scale (PRD `data_volume: small`).

## Migration Notes

None — S-02 adds no schema changes and regenerates no types. It reads/writes the existing F-01 `expiry_date` column.

> Operational dependency (same as S-01): manual verification requires a locally-configured Supabase + a confirmed user (`.env`/`.dev.vars` set, local stack running). Auth is operationally inactive until Worker secrets + Supabase Auth URLs are set (deploy-plan G3/G4).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (US-02, FR-002, FR-010; Business Logic; thresholds fixed per FR-007/FR-012)
- F-01 schema: `supabase/migrations/20260612121806_create_medications.sql`; types `src/lib/database.types.ts`
- Patterns to mirror (S-01): `src/lib/medications/forecast.ts`, `src/components/medications/MedicationCard.astro`, `src/pages/medications/index.astro`, `src/components/medications/AddMedicationForm.tsx`, `src/pages/api/medications/index.ts`, `src/lib/medications/queries.ts`
- Cross-slice note: keep S-02 off `MedicationCard.astro` and limit `queries.ts` edits to the input contract, so S-03 (edit/refill/archive) and S-04 (summary) can build on this without conflict.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Expiry classification logic + shelf view (read path)

#### Automated

- [x] 1.1 `npx astro sync` regenerates types without error
- [x] 1.2 `npm run build` passes
- [x] 1.3 `npm run lint` passes

#### Manual

- [x] 1.4 Review `classifyExpiry` against the band spec table
- [x] 1.5 Confirm date-granular `daysUntil` with no round-up (guardrail)
- [x] 1.6 Seeded ~30-day med shows amber "Soon" with relative phrase
- [x] 1.7 Seeded already-expired med shows red "Expired", pinned top
- [x] 1.8 Seeded >90-day med shows green "OK"
- [x] 1.9 Multiple dated meds ordered soonest-expiry first
- [x] 1.10 Med with no `expiry_date` is absent from the shelf
- [x] 1.11 Empty state shows when no dated meds; Topbar "Shelf" link works; run-out view unchanged

### Phase 2: Add-path expiry field (write path)

#### Automated

- [ ] 2.1 `npx astro sync` passes
- [ ] 2.2 `npm run build` passes
- [ ] 2.3 `npm run lint` passes

#### Manual

- [ ] 2.4 Add med with expiry date → appears on the shelf with correct band/date/phrase
- [ ] 2.5 Expiry ~30–90 days out → "Soon" (amber)
- [ ] 2.6 Past expiry date → "Expired" (red), pinned top
- [ ] 2.7 No expiry date → absent from shelf, present on run-out view
- [ ] 2.8 Existing add flow unaffected (count/dosing save; blank name + negatives rejected)
- [ ] 2.9 Add launched from shelf returns to /medications/shelf after save
- [ ] 2.10 Add from run-out view / direct /medications/new returns to /medications after save
