# Medication Management (S-03) Implementation Plan

## Overview

S-03 `medication-management` adds the three lifecycle actions on an existing
`medications` record: **refill** (FR-003, an additive top-up to the pill count),
**edit** (FR-004, an absolute correction of any field), and **archive** (FR-005,
soft-delete that removes a med from active views while preserving its row). All
three are reached from a single **dedicated per-medication manage page**
(`/medications/[id]/edit`), opened by one "Edit" link on each card. The page
hosts the generalized add/edit form, an additive refill control, and a
native-confirm archive button.

This is the first slice that **updates** the F-01 record (S-01/S-02 only added
and read it). It reuses every established pattern — the controlled React form
island, native POST → self-guarding API handler → redirect-with-`?error`, and
the owner-scoped query helpers — and adds no schema, no `db:types` regen, and no
middleware change.

PRD refs: FR-003 (refill), FR-004 (edit), FR-005 (archive/soft-delete).

## Current State Analysis

- **The schema already supports every S-03 action.** F-01's migration
  (`supabase/migrations/20260612121806_create_medications.sql`) ships an
  owner-scoped **UPDATE** policy, the `archived_at timestamptz` column, and a
  `moddatetime` trigger that auto-touches `updated_at` on every row update. So
  refill and edit are plain `UPDATE`s, archive is an `UPDATE` that sets
  `archived_at`, and **no migration / no `db:types` regen** is needed — the
  lessons-register db:types rule does not apply (same as S-01/S-02).
- **Archive is nearly free at the read layer.** `getActiveMedications` already
  filters `.is("archived_at", null)` (`src/lib/medications/queries.ts:23`), so
  setting `archived_at` removes a med from **both** the run-out list and the
  shelf with zero view changes.
- **RLS makes "not owned" indistinguishable from "not found."** The UPDATE
  policy's `using ((select auth.uid()) = user_id)` means an update targeting a
  row the caller doesn't own simply matches **0 rows** — no error, no data. Every
  S-03 handler must treat a 0-row update (and a null single-row fetch) as a
  not-found error, not a silent success.
- **The write path is a 1:1 template.** Create flows through
  `AddMedicationForm.tsx` (controlled island, native `<form method="POST">`) →
  `new.astro` (hosts the island, reads `?error`/`?from`) →
  `POST /api/medications` (`src/pages/api/medications/index.ts`: self-guards
  `createClient` + `locals.user`, parses with `asString` / `parseOptionalNumber`
  / `optionalText` / `optionalDate`, redirects back with `?error=` on failure) →
  `createMedication` (`queries.ts`). Edit is the same shape pointed at an existing
  row; refill and archive are narrower variants.
- **Routing is already covered.** `/medications/[id]/edit` sits under the
  `/medications` prefix, so `PROTECTED_ROUTES` (`src/middleware.ts:4`) gates it
  via the existing `startsWith`. `/api/medications/*` is **not** under that prefix,
  so the new API handlers self-guard (per CLAUDE.md convention) like the create
  route does.
- **Cards are intentionally lean.** S-02 deliberately kept `MedicationCard.astro`
  and `ExpiryCard.astro` free of actions so S-03 could add management affordances
  without churn; each gets exactly one "Edit" link here.
- **No test runner** (`npm test` does not exist). Verification is `astro sync` →
  `npm run build` / `npm run lint` plus manual UI checks against a
  locally-configured Supabase.

### Key Discoveries:

- **Refill is additive, edit is absolute (PRD FR-003/FR-004).** Refill computes
  `pill_count = (current ?? 0) + N` (N > 0); edit sets the count (and all other
  fields) to absolute values. The two coexist on the manage page with distinct
  labels — refill is the top-up, edit is the drift-correction.
- **Guardrail still lives in the read layer.** `computeRunout`
  (`src/lib/medications/forecast.ts`) and `classifyExpiry`
  (`src/lib/medications/expiry.ts`) recompute on every render, so editing the
  count/dosing/expiry re-classifies automatically — the never-wrong-optimistic
  floor and never-overstate-expiry guardrails carry over unchanged. S-03 writes
  no new forecasting logic.
- **Archive must be idempotent and never destructive.** The archive update
  filters `.is("archived_at", null)`; re-archiving an already-archived (or
  not-owned) row matches 0 rows and is surfaced as an error. There is **no hard
  delete** anywhere — the "data never silently lost" guardrail (PRD §Success
  Criteria) is the reason FR-005 is soft-delete.
- **Parse logic must not drift.** The create handler's field parsers
  (`src/pages/api/medications/index.ts:5-41`) are exactly what the edit handler
  needs. Extracting them to one shared module (consumed by both) prevents the
  same drift the "generalize the form" decision avoids on the client side.
- **`updated_at` is automatic.** The `moddatetime` trigger touches `updated_at`
  on every edit/refill/archive — no handler code required.

## Desired End State

A signed-in user can, from either the run-out list or the shelf:

- click **Edit** on a medication card and land on `/medications/[id]/edit`, which
  shows the medication's current values pre-filled in the form;
- **edit** any field (name, active substance, description, absolute pill count,
  morning/midday/night doses, expiry date) and save — returning to the run-out
  list with the medication re-forecast/re-classified accordingly;
- **refill** via a dedicated "+N" control that adds to the current pill count
  (leaving all other fields untouched);
- **archive** via a button guarded by a native confirmation; the medication
  disappears from both the run-out list and the shelf, while its row (and
  history) remains in the database.

Verify: `astro sync && npm run build && npm run lint` pass; the manual scenarios
below behave as described against a locally-configured Supabase + auth; a refill
of +30 on a 5-pill med yields exactly 35; an edit that sets the count to 0 shows
"Out now"; an archived med is gone from both views but its row still exists in
Supabase Studio (no hard delete); editing/refilling/archiving a non-owned id
fails cleanly rather than touching another user's data.

## What We're NOT Doing

- **Archived-medications list / unarchive / restore UI** — archive is one-way in
  the app this slice (record preserved, restorable via the DB if ever needed).
  An in-app archived view is out of scope for FR-005's "remove from active views
  while preserving the record."
- **Hard delete** — never; FR-005 is soft-delete only.
- **Refill history / audit log / per-refill records** — refill mutates the single
  count; no event table.
- **Pack-size modeling** (packs × pills-per-pack) — not in the schema; refill
  takes a raw pill count to add.
- **Inline per-row refill/archive buttons on the cards** — all three actions live
  on the manage page; each card gets only an "Edit" link.
- **Summary counts** (FR-011 / S-04), **out-of-app notifications** (FR-009, v2),
  **configurable thresholds** (FR-012), **substance duplicate detection**
  (FR-013), **non-daily dosing** — all out of MVP / this slice.
- **Schema change, migration, or `db:types` regen** — none; the columns and the
  UPDATE policy already exist.
- **Middleware change** — the new page is already covered by `PROTECTED_ROUTES`;
  the API routes self-guard.
- **Optimistic-concurrency / row versioning** — refill is read-then-write; at
  single-user MVP scale a lost-update race is an accepted risk (noted below).
- **No new test runner.**

## Implementation Approach

Three phases on the data → read → write grain, each independently verifiable:

1. **Data-access helpers + shared parse module** first, so edit/refill/archive
   consume settled, typed contracts and the field parsers have one home before
   any handler uses them. No UI.
2. **Manage page + edit** next — generalize the add form to also edit, build the
   manage page that pre-fills it, wire the edit endpoint, and add the "Edit" link
   to both cards. This delivers FR-004 end-to-end and stands up the page the next
   phase extends.
3. **Refill + archive** last — add the two narrower controls to the manage page
   and their endpoints, closing FR-003 and FR-005.

Every write reuses the create flow's shape (native POST → self-guarding handler →
redirect with `?error=`), so no new client data-fetching pattern is introduced.

## Critical Implementation Details

- **Not-found / not-owned is an error, never a silent pass (load-bearing).** RLS
  hides non-owned rows, so a malicious or stale id yields a 0-row update or a
  null fetch. Page load (`edit.astro`) with a missing row → redirect to
  `/medications`. A handler whose update matches 0 rows → redirect back with
  `?error=` (to the manage page if it may still exist, else the list). Use
  `.select()` on the update and check the returned row count to detect this.
- **Refill additivity + null handling.** `refillMedication` reads the current
  `pill_count`, treats `null` as `0`, adds `N` (validated `> 0`), and writes the
  sum. Read-then-write is acceptable at single-user MVP scale; a concurrent
  double-refill could lose an update — accepted risk, noted in Open Risks.
- **Archive idempotency + non-destructiveness.** The archive update sets
  `archived_at = now()` filtered by `.is("archived_at", null)`; a second archive
  (or a not-owned id) matches 0 rows → error. Never issue a `DELETE`.
- **Edit count parsing reuses the create rules verbatim.** Empty/blank numeric
  fields → `null` (not `0`), because `Number("") === 0` would silently store a
  false `0` — the exact bug the create handler's `parseOptionalNumber` guards.
  The shared parse module preserves that behavior for edit.

## Phase 1: Data-access helpers + shared parse module

### Overview

Add the typed read/update/refill/archive helpers and extract the form-field
parsers into one module the create and edit handlers both import. No UI, no
routing.

### Changes Required:

#### 1. Shared form-parse module

**File**: `src/lib/medications/parse.ts` (new)

**Intent**: One home for the medication form-field parsers so the create and edit
handlers can't drift. Moves the existing logic out of the create route unchanged.

**Contract**: Export `asString(raw: FormDataEntryValue | null): string`,
`parseOptionalNumber(raw): { value: number | null; invalid: boolean }`,
`optionalText(raw): string | null`, and
`optionalDate(raw): { value: string | null; invalid: boolean }` — moved verbatim
from `src/pages/api/medications/index.ts:5-41` (same null/empty and
`YYYY-MM-DD` semantics). No behavior change.

#### 2. Refactor the create handler to use the shared module

**File**: `src/pages/api/medications/index.ts`

**Intent**: Consume the extracted parsers instead of its local copies, so the new
module is the single source.

**Contract**: Remove the four local parser functions; import them from
`@/lib/medications/parse`. `returnPathFor` / `backToForm` stay local (create-only
concern). No change to the route's behavior or to `createMedication`.

#### 3. Query helpers for fetch / update / refill / archive

**File**: `src/lib/medications/queries.ts`

**Intent**: Typed, owner-scoped helpers for the three actions plus the single-row
fetch the manage page needs. Each surfaces "not found / not owned" distinctly.

**Contract**:

- Reuse `NewMedicationInput` as the editable field set (export an alias
  `type EditMedicationInput = NewMedicationInput` for call-site clarity).
- `getMedicationById(supabase, id: string): Promise<MedicationRow | null>` —
  `select("*").eq("id", id).is("archived_at", null).maybeSingle()`; returns the
  row or `null` (RLS scopes to owner). Throw on a non-"no rows" Postgrest error
  (mirror `getActiveMedications`).
- `updateMedication(supabase, id: string, input: EditMedicationInput): Promise<{ error: PostgrestError | null; notFound: boolean }>` —
  `update(input).eq("id", id).is("archived_at", null).select()`; `notFound` true
  when no error and 0 rows returned.
- `refillMedication(supabase, id: string, addCount: number): Promise<{ error: PostgrestError | null; notFound: boolean }>` —
  fetch current row via `getMedicationById`; if null → `notFound`; else update
  `pill_count` to `(current.pill_count ?? 0) + addCount` (caller guarantees
  `addCount > 0`), `.eq("id", id).is("archived_at", null).select()`.
- `archiveMedication(supabase, id: string): Promise<{ error: PostgrestError | null; notFound: boolean }>` —
  `update({ archived_at: <ISO now> }).eq("id", id).is("archived_at", null).select()`;
  `notFound` true on 0 rows (already archived or not owned).

### Success Criteria:

#### Automated Verification:

- `npx astro sync` regenerates types without error
- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- Review the four query helpers: each scopes by `id` + `archived_at IS NULL`,
  uses `.select()` to detect 0-row updates, and returns `notFound` rather than
  swallowing it.
- Confirm `refillMedication` treats a `null` current count as `0` and adds.
- Confirm the create route still parses identically (imports from the new module;
  no local parser copies remain).

**Implementation Note**: After automated verification passes, pause for human
confirmation of the helper-contract review before Phase 2.

---

## Phase 2: Manage page + edit (read + edit write path)

### Overview

Generalize the add form so it also edits, build the manage page that pre-fills it
from the existing row, wire the edit endpoint, and add a single "Edit" link to
both card components. Delivers FR-004 end-to-end.

### Changes Required:

#### 1. Generalize the medication form

**File**: `src/components/medications/MedicationForm.tsx` (renamed from
`AddMedicationForm.tsx`)

**Intent**: One controlled island serving both add and edit, so the field set and
client validation have a single source (the same drift-avoidance as the shared
parser). Defaults preserve today's add behavior exactly.

**Contract**: Add props `initialValues?: Partial<Values>` (merged over `EMPTY`),
`action?: string` (default `"/api/medications"`), and `submitLabel?: string` /
`submitPendingText?: string` (default "Add medication" / "Adding..."). The form's
`action` uses the prop; the submit button uses the labels. The hidden `from`
input and existing validation are unchanged. Rename the default export to
`MedicationForm`. Update the import in `src/pages/medications/new.astro` (the only
consumer) to the new name; its usage keeps the defaults, so add behavior is
untouched.

#### 2. Manage (edit) page

**File**: `src/pages/medications/[id]/edit.astro` (new)

**Intent**: The per-medication management surface. Loads the row, pre-fills the
generalized form for editing, and (in Phase 3) hosts the refill and archive
controls. Mirrors `new.astro`'s layout.

**Contract**: Read `Astro.params.id`; `createClient(...)` (null → config-error
fallback). `med = await getMedicationById(supabase, id)`; if `null` →
`return Astro.redirect("/medications")` (not found / not owned / archived). Read
`?error` for server-side failures. Map the row to the form's `Values` shape
(numbers → strings, `null` → `""`, `expiry_date` passed through as
`"YYYY-MM-DD"`) and render
`<MedicationForm initialValues={...} action={`/api/medications/${id}/edit`} submitLabel="Save changes" serverError={error} client:load />`.
Include a "Back to medications" link to `/medications`. Page title "Edit
medication". (Refill + archive controls are added in Phase 3.)

#### 3. Edit endpoint

**File**: `src/pages/api/medications/[id]/edit.ts` (new)

**Intent**: Validate and persist an absolute edit of all fields, then redirect;
self-guards auth + ownership and owns its error responses.

**Contract**: `export const POST: APIRoute`. Guard `createClient` (null → redirect
`/medications`) and `context.locals.user` (null → `/auth/signin`). Read
`context.params.id`. Parse the form with the shared `parse` helpers exactly as the
create route does (trim `name`; blank → `?error=`; `parseOptionalNumber` for
count/doses with the invalid check; `optionalDate` for expiry; `optionalText` for
substance/description). Build an `EditMedicationInput`, call
`updateMedication(supabase, id, input)`. On `error` or `notFound` → redirect back
to `/medications/${id}/edit?error=<message>` (notFound message e.g. "Medication
not found"). On success → `context.redirect("/medications")`.

#### 4. "Edit" link on both cards

**Files**: `src/components/medications/MedicationCard.astro`,
`src/components/medications/ExpiryCard.astro`

**Intent**: One affordance per card to reach the manage page, keeping the cards
otherwise lean.

**Contract**: Add a single `<a href={`/medications/${med.id}/edit`}>Edit</a>`
styled as a subtle link/button consistent with each card's existing styling (e.g.
near the status badge or in the footer row). `med.id` is already on
`MedicationRow`. No other card changes.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` passes
- `npm run build` passes
- `npm run lint` passes
- Add flow still compiles against the renamed form (grep `new.astro` imports
  `MedicationForm`)

#### Manual Verification:

- From the run-out list, click "Edit" on a med → lands on
  `/medications/[id]/edit` with all fields pre-filled with current values.
- From the shelf, "Edit" on a dated med → same page, expiry pre-filled.
- Change the name + an absolute pill count + a dose → save → back on
  `/medications`, the row reflects the new values and re-forecasts (e.g. lowering
  the count to under 7 days shows "Critical").
- Edit the expiry date → the shelf reflects the new band/date.
- Set the pill count to 0 via edit → "Out now".
- Submit a blank name (bypassing client validation via direct POST) → server
  redirects back to the manage page with an error.
- Submit a negative count → rejected with an error.
- Visit `/medications/<nonexistent-or-other-users-id>/edit` → redirected to
  `/medications` (not found).
- The add flow is unaffected: adding a new med still works and still returns to
  the correct view (`from` token intact).

**Implementation Note**: After automated verification passes, pause for human
confirmation of the edit scenarios before Phase 3.

---

## Phase 3: Refill + archive (remaining write paths)

### Overview

Add the additive refill control and the native-confirm archive button to the
manage page, with their endpoints. Closes FR-003 and FR-005.

### Changes Required:

#### 1. Refill + archive controls on the manage page

**File**: `src/pages/medications/[id]/edit.astro`

**Intent**: Two small native forms below the edit form — an additive refill input
and an archive button — operating on the same medication.

**Contract**: A **refill** `<form method="POST" action={`/api/medications/${id}/refill`}>`
with a single `name="add_count"` number input (`type="number"`, `min="1"`,
`step="1"`, label "Refill (+N)", hint "Adds to the current pill count") and a
submit button "Add to stock". A separate **archive**
`<form method="POST" action={`/api/medications/${id}/archive`}>` with a submit
button "Archive" and an inline
`onsubmit="return confirm('Archive this medication? It will leave your active views (its record is kept).')"`.
Both are plain Astro forms (no island needed). Visually separate the refill and
archive blocks from the edit form (e.g. a divider) so the additive refill is not
confused with the absolute "Pill count" field above it.

#### 2. Refill endpoint

**File**: `src/pages/api/medications/[id]/refill.ts` (new)

**Intent**: Add a positive quantity to the medication's current pill count.

**Contract**: `export const POST: APIRoute`. Guard `createClient` (null →
`/medications`) and `context.locals.user` (null → `/auth/signin`). Read
`context.params.id`. Parse `add_count` via shared `parseOptionalNumber`; reject if
`null` (blank) or `invalid` or not `> 0` → redirect back to
`/medications/${id}/edit?error=Enter a refill amount greater than 0`. Call
`refillMedication(supabase, id, addCount)`. On `error` or `notFound` → redirect
back with `?error=`. On success → `context.redirect("/medications")`.

#### 3. Archive endpoint

**File**: `src/pages/api/medications/[id]/archive.ts` (new)

**Intent**: Soft-delete the medication (set `archived_at`), removing it from
active views while preserving the row.

**Contract**: `export const POST: APIRoute`. Guard `createClient` and
`context.locals.user` as above. Read `context.params.id`. Call
`archiveMedication(supabase, id)`. On `error` or `notFound` (already archived /
not owned) → redirect back to `/medications/${id}/edit?error=<message>`. On
success → `context.redirect("/medications")`. No request body needed beyond the
id; never issues a delete.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` passes
- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- On a med showing 5 pills, refill +30 → returns to `/medications`; the med now
  shows 35 pills and a re-computed run-out date.
- Refill a med whose count was blank/`null` → the count becomes exactly the
  refill amount.
- Submit a refill of 0 or a negative/blank value → rejected with an error on the
  manage page; the count is unchanged.
- Click "Archive", cancel the confirm dialog → nothing happens, med still
  present. Confirm it → med disappears from `/medications` **and**
  `/medications/shelf`.
- In Supabase Studio, confirm the archived row still exists with `archived_at`
  set (no hard delete) and its prior `pill_count`/`expiry_date` intact.
- Attempt to refill or archive a non-owned/nonexistent id (direct POST) → fails
  with an error redirect; no other user's row is changed.
- Archive an already-archived med (re-POST) → handled as not-found, no error
  thrown, no second mutation.

**Implementation Note**: After automated verification passes, pause for human
confirmation of the refill + archive scenarios.

---

## Testing Strategy

No test runner is configured (per CLAUDE.md); verification is build/lint +
manual.

### Logic checks (by review):

- Refill additivity: `(current ?? 0) + N`, N > 0 enforced; null count → N.
- Archive idempotency: `.is("archived_at", null)` filter → re-archive is a no-op
  not-found; no `DELETE` anywhere.
- Not-found handling: every handler detects 0-row updates / null fetch and
  surfaces an error instead of a silent success.
- Edit parsing matches create exactly (shared module): blank numeric → `null`,
  not `0`.

### Manual Testing Steps (end-to-end, after Phase 3):

1. Sign in → `/medications`, pick a med, click "Edit".
2. Edit name + count + a dose → save → verify the updated, re-forecast row.
3. Refill +N → verify the count increases by exactly N and the forecast updates.
4. Edit the expiry date → verify the shelf band/date updates.
5. Archive (confirm) → verify it vanishes from both the list and the shelf.
6. In Supabase Studio, verify the archived row persists with `archived_at` set.
7. Direct-POST a not-owned id to each endpoint → verify a clean error, no
   cross-user mutation.

## Performance Considerations

All operations are single-row, owner-scoped writes (or a single-row fetch) over a
small per-user table with `medications_user_id_idx` present. Refill is two queries
(read then write); negligible at MVP scale (PRD `data_volume: small`,
`qps: low`). No performance concern.

## Migration Notes

None — S-03 adds no schema changes and regenerates no types. It updates the
existing F-01 `medications` row (count/fields for edit/refill, `archived_at` for
archive) through the existing UPDATE RLS policy.

> Operational dependency (same as S-01/S-02): manual verification requires a
> locally-configured Supabase + a confirmed user (`.env` / `.dev.vars` set, local
> stack running). Auth is operationally inactive until Worker secrets +
> Supabase Auth URLs are set (deploy-plan G3/G4).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-003 refill, FR-004 edit, FR-005 archive;
  §Success Criteria "data never silently lost" guardrail)
- F-01 schema: `supabase/migrations/20260612121806_create_medications.sql`
  (UPDATE policy, `archived_at`, `moddatetime` trigger); types
  `src/lib/database.types.ts`
- Patterns to mirror (S-01/S-02): `src/components/medications/AddMedicationForm.tsx`
  (→ generalized), `src/pages/medications/new.astro`,
  `src/pages/api/medications/index.ts` (create handler + parsers),
  `src/lib/medications/queries.ts`, `src/pages/medications/index.astro`,
  `src/pages/medications/shelf.astro`
- Read-layer guardrails (unchanged, recompute on render):
  `src/lib/medications/forecast.ts`, `src/lib/medications/expiry.ts`
- Lessons: `context/foundation/lessons.md` (db:types ignore — N/A here, no regen)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data-access helpers + shared parse module

#### Automated

- [x] 1.1 `npx astro sync` regenerates types without error
- [x] 1.2 `npm run build` passes
- [x] 1.3 `npm run lint` passes

#### Manual

- [x] 1.4 Review the four query helpers (id + archived_at scope, 0-row detection, notFound)
- [x] 1.5 Confirm `refillMedication` treats null current count as 0 and adds
- [x] 1.6 Confirm the create route parses identically via the shared module (no local copies)

### Phase 2: Manage page + edit (read + edit write path)

#### Automated

- [ ] 2.1 `npx astro sync` passes
- [ ] 2.2 `npm run build` passes
- [ ] 2.3 `npm run lint` passes
- [ ] 2.4 Add flow compiles against the renamed `MedicationForm`

#### Manual

- [ ] 2.5 "Edit" from the run-out list pre-fills the form with current values
- [ ] 2.6 "Edit" from the shelf pre-fills (incl. expiry)
- [ ] 2.7 Editing name + absolute count + dose saves and re-forecasts on the list
- [ ] 2.8 Editing the expiry date updates the shelf band/date
- [ ] 2.9 Setting the count to 0 via edit shows "Out now"
- [ ] 2.10 Blank name (direct POST) rejected back to the manage page with an error
- [ ] 2.11 Negative count rejected with an error
- [ ] 2.12 Nonexistent / not-owned id at `/edit` redirects to `/medications`
- [ ] 2.13 Add flow unaffected (still adds, still returns to the right view)

### Phase 3: Refill + archive (remaining write paths)

#### Automated

- [ ] 3.1 `npx astro sync` passes
- [ ] 3.2 `npm run build` passes
- [ ] 3.3 `npm run lint` passes

#### Manual

- [ ] 3.4 Refill +30 on a 5-pill med → shows 35 and a re-computed run-out
- [ ] 3.5 Refill a null-count med → count becomes exactly the refill amount
- [ ] 3.6 Refill of 0 / negative / blank rejected; count unchanged
- [ ] 3.7 Archive cancel → no change; confirm → gone from list AND shelf
- [ ] 3.8 Archived row persists in Studio with `archived_at` set (no hard delete)
- [ ] 3.9 Refill/archive of a not-owned/nonexistent id fails cleanly, no cross-user mutation
- [ ] 3.10 Re-archiving an already-archived med is a not-found no-op
