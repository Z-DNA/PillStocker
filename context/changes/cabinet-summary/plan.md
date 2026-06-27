# Cabinet Summary (S-04) Implementation Plan

## Overview

S-04 `cabinet-summary` adds the MVP's final slice: a **minimal summary landing
screen** at `/dashboard` showing two counts — how many medications are **running
low** and how many are **expiring soon / expired** — and makes it the post-login
landing. Each count is a clickable card that jumps to the matching view
(`/medications` and `/medications/shelf`). It aggregates the existing
`computeRunout` and `classifyExpiry` classifiers in memory over the same
owner-scoped `getActiveMedications` query the other views use — no schema, no new
query, no changes to the cards or `queries.ts`.

This is deliberately the smallest possible "daily anchor" per FR-011 (counts
only), not a dashboard — scope creep toward charts/trends/breakdowns is explicitly
resisted.

PRD refs: FR-011.

## Current State Analysis

- **`/dashboard` is a reserved, empty slot.** There is no `dashboard.astro` page;
  `src/middleware.ts:9` force-redirects `/dashboard` → `/medications`, with a
  comment stating the slot is "reserved for the future cabinet-summary slice
  (S-04)." `/dashboard` is already in `PROTECTED_ROUTES`
  (`src/middleware.ts:4`), so the page will be auth-gated the moment it exists —
  no middleware protection change needed, only removing the redirect.
- **Post-login landing is `/medications`** (`src/pages/api/auth/signin.ts:19`).
  FR-011 calls for a summary _landing_ screen, so this slice repoints the
  redirect to `/dashboard`.
- **Both classifiers are pure and ready.** `computeRunout(med, today)` returns a
  `RunoutStatus` of `out | critical | warning | safe | none`
  (`src/lib/medications/forecast.ts`); `classifyExpiry(expiryDate, today)`
  returns `expired | soon | ok` with `EXPIRY_SOON_DAYS = 90`
  (`src/lib/medications/expiry.ts`). The summary computes counts directly from
  these — it adds no new forecasting/classification logic and inherits both
  guardrails unchanged.
- **One owner-scoped query already returns everything needed.**
  `getActiveMedications(supabase)` (`src/lib/medications/queries.ts:22`) returns
  all active rows incl. `pill_count`, the three doses, and `expiry_date`. The
  summary reuses it and aggregates in memory (PRD `data_volume: small`), exactly
  as the shelf does — no dedicated summary query.
- **The SSR page pattern is established.** `src/pages/medications/index.astro`
  and `shelf.astro` show the shape to mirror: `createClient(...)` (null →
  config-error fallback), `getActiveMedications` wrapped in try/catch with a
  `Banner` error variant, `Topbar`, the `bg-cosmic` glass-card layout under
  `max-w-2xl`, and an empty state with an add CTA.
- **Home `/` is the public starter Welcome page** (unbranded boilerplate,
  Sign in / Sign up CTAs) — not part of this slice.
- **No test runner** (`npm test` does not exist). Verification is `astro sync` →
  `npm run build` / `npm run lint` plus manual UI checks against a
  locally-configured Supabase.

### Key Discoveries:

- **"Running low" = forecastable meds below the green band** — run-out status in
  `{ warning, critical, out }` (i.e. `< 14` days left). Meds with `none` (no
  daily dose, no forecast) and `safe` (≥14 days) are excluded. This matches the
  yellow/red bands users already see and the card's own "Low" label.
- **"Expiring soon / expired" = expiry status in `{ soon, expired }`** — meds
  with an `expiry_date` within 90 days **or** already past. Folding `expired`
  into this count is the guardrail: an already-expired med must never be silently
  dropped from the summary (never wrong-optimistic). The card label names both
  states.
- **No new query and no card edits keep S-04 collision-free with S-03.** S-03
  (parallel) touches `queries.ts`, the cards, and the API; S-04 touches none of
  them — only a new page, a new pure helper, `middleware.ts`, `signin.ts`, and
  `Topbar.astro`.
- **`/dashboard` is already protected**, so removing the redirect is safe — an
  unauthenticated `/dashboard` hit still redirects to `/auth/signin` via the
  existing `PROTECTED_ROUTES` check.

## Desired End State

A signed-in user lands on `/dashboard` after signing in and sees:

- two count cards — **"N running low"** (linking to `/medications`) and
  **"M expiring soon / expired"** (linking to `/medications/shelf`);
- when they have active meds but both counts are zero, a reassuring **all-clear**
  message ("All good — nothing running low or expiring soon");
- when they have no medications at all, an **"Add your first medication"** CTA;
- a Topbar "Summary" link reachable from every authenticated view;
- the run-out list and shelf unchanged.

Verify: `astro sync && npm run build && npm run lint` pass; signing in lands on
`/dashboard`; the two counts match what the run-out and shelf views show for a
seeded set (e.g. a med at 10 days left + a med expiring in 30 days + an
already-expired med → "running low: 1", "expiring soon / expired: 2"); an
unauthenticated `/dashboard` hit redirects to `/auth/signin`.

## What We're NOT Doing

- **Any "dashboard" content beyond the two counts** — no charts, trends, history,
  per-status breakdowns, next-run-out date, or recent-activity. FR-011 is
  counts-only; resist the dashboard pull.
- **A third "expired" count** — expired folds into the single "expiring soon /
  expired" number (per the chosen definition).
- **A new summary query or DB-side aggregation** — reuse `getActiveMedications`
  and count in memory.
- **Card / `queries.ts` / API changes** — none; S-04 only reads.
- **Re-branding or changing the public home `/` Welcome page** — out of scope.
- **Configurable thresholds** (FR-012), **notifications** (FR-009, v2),
  **substance dedup** (FR-013) — out of MVP / this slice.
- **Schema change, migration, `db:types` regen, or `PROTECTED_ROUTES` change** —
  none needed.
- **No new test runner.**

## Implementation Approach

Two small phases on the logic → view → landing grain:

1. **Summary logic + the `/dashboard` page** — a pure `summarizeCabinet` helper
   (so the count definitions are reviewable in isolation and inherit the
   classifier guardrails), the SSR page mirroring `index.astro`/`shelf.astro`,
   and removal of the `/dashboard` redirect so the page renders. Verifiable by
   visiting `/dashboard` directly with seeded meds, before any landing change.
2. **Make it the landing + nav** — repoint the post-signin redirect and add the
   Topbar link, so the summary becomes the daily anchor. Verifiable by signing in
   and navigating.

Splitting this way keeps Phase 1 verifiable without disturbing the current
landing, and isolates the small cross-file repoint into Phase 2.

## Phase 1: Summary logic + `/dashboard` page

### Overview

Add the pure aggregation helper and the summary page, and remove the
`/dashboard` redirect so the page is reachable. No landing/nav change yet.

### Changes Required:

#### 1. Summary aggregation helper

**File**: `src/lib/medications/summary.ts` (new)

**Intent**: One pure function that turns the active-medication rows + "today" into
the two counts (plus the total, for the empty-state decision), reusing the
existing classifiers so the count definitions live in one reviewable place and
inherit both never-wrong-optimistic guardrails. Mirrors `forecast.ts` / `expiry.ts`.

**Contract**:

- `interface CabinetSummary { total: number; runningLow: number; expiringSoon: number }`
- `summarizeCabinet(meds: MedicationRow[], today: Date): CabinetSummary` —
  `total` = `meds.length` (already active, since `getActiveMedications` filters
  `archived_at IS NULL`). `runningLow` = count of meds whose
  `computeRunout(med, today).status` is in `{ "warning", "critical", "out" }`.
  `expiringSoon` = count of meds with a non-null `expiry_date` whose
  `classifyExpiry(<date parsed from parts>, today).status` is in
  `{ "soon", "expired" }`. Parse `expiry_date` from its `"YYYY-MM-DD"` parts
  (year, month-1, day) to avoid the UTC-vs-local day shift, exactly as
  `shelf.astro:26-27` does. `MedicationRow` = `Tables<"medications">`.

#### 2. Summary (dashboard) page

**File**: `src/pages/dashboard.astro` (new)

**Intent**: The summary landing. Loads active meds, computes the two counts
against a single server-side "today", and renders them as clickable cards plus the
all-clear / empty-account states. Mirrors `index.astro`/`shelf.astro` structure
and styling.

**Contract**: Frontmatter: `createClient(...)` (null → `loadError` config
fallback); `meds = await getActiveMedications(supabase)` in try/catch — on a
thrown query error set `loadError` and render the `Banner` error variant (not a
silent zero). On success compute `summary = summarizeCabinet(meds, new Date())`.
Render under the shared `Layout` (title "Summary") + `Topbar` in the `bg-cosmic` /
`max-w-2xl` shell with a gradient "Summary" heading:

- If `summary.total === 0` → empty state ("No medications yet" + an "Add your
  first medication" CTA linking to `/medications/new`), matching `index.astro`'s
  empty state.
- Else two count cards: **"{runningLow} running low"** wrapped in an
  `<a href="/medications">` and **"{expiringSoon} expiring soon / expired"**
  wrapped in an `<a href="/medications/shelf">`, styled as the existing glass
  cards (a number + label each). When both counts are `0`, also show a reassuring
  all-clear line ("All good — nothing running low or expiring soon"). Pluralize
  the labels sensibly.

#### 3. Remove the `/dashboard` redirect

**File**: `src/middleware.ts`

**Intent**: Stop intercepting `/dashboard` so the new page renders; protection
stays via the existing `PROTECTED_ROUTES` entry.

**Contract**: Delete the `if (context.url.pathname === "/dashboard") return context.redirect("/medications")`
block (and its comment) at `src/middleware.ts:7-11`. Leave `PROTECTED_ROUTES`
(which already contains `/dashboard`) and the rest of the middleware unchanged.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` regenerates types without error
- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- Review `summarizeCabinet`: `runningLow` counts `warning|critical|out` (excludes
  `safe` and `none`); `expiringSoon` counts `soon|expired` over meds with an
  `expiry_date`; expiry date parsed from parts (no UTC day shift).
- Seed meds and visit `/dashboard` directly: a med at ~10 days left → counted in
  "running low"; a `safe` (≥14d) med and a no-forecast med → not counted.
- Seed a med expiring in ~30 days and an already-expired med → both counted in
  "expiring soon / expired" (= 2).
- Click "running low" → navigates to `/medications`; click "expiring soon /
  expired" → navigates to `/medications/shelf`.
- With active meds but 0 low / 0 expiring → all-clear message shows.
- With no meds at all → "Add your first medication" CTA shows.
- A simulated query error renders the error banner (not silent zeros).
- Unauthenticated `/dashboard` → redirects to `/auth/signin`.

**Implementation Note**: After automated verification passes, pause for human
confirmation of the count correctness and the seeded scenarios before Phase 2.

---

## Phase 2: Make it the landing + nav

### Overview

Repoint the post-signin redirect to `/dashboard` and add a Topbar "Summary" link,
so the summary becomes the authenticated landing and is reachable from every view.

### Changes Required:

#### 1. Post-signin redirect

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Land signed-in users on the summary instead of the run-out list.

**Contract**: Change the success redirect from `/medications`
(`src/pages/api/auth/signin.ts:19`) to `/dashboard`. No other change.

#### 2. Topbar "Summary" link

**File**: `src/components/Topbar.astro`

**Intent**: Let signed-in users reach the summary from anywhere.

**Contract**: In the authenticated nav group (the
`<div class="flex items-center gap-3">` at ~line 12, alongside the existing
"Medications" and "Shelf" links), add an `<a href="/dashboard">Summary</a>`
styled like its siblings. Place it first (left-most) so it reads
Summary · Medications · Shelf.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` passes
- `npm run build` passes
- `npm run lint` passes

#### Manual Verification:

- Sign in → land on `/dashboard` (the summary), not `/medications`.
- The Topbar "Summary" link appears on `/dashboard`, `/medications`, and
  `/medications/shelf` and navigates to `/dashboard`.
- The run-out list and shelf are otherwise unchanged; their own nav links still
  work.

**Implementation Note**: After automated verification passes, pause for human
confirmation of the landing + nav behavior.

---

## Testing Strategy

No test runner is configured (per CLAUDE.md); verification is build/lint +
manual.

### Logic checks (Phase 1, by review):

- `runningLow` membership: `warning | critical | out` only (not `safe`, not
  `none`).
- `expiringSoon` membership: `soon | expired` over meds with `expiry_date`;
  expired included (never dropped).
- Counts are consistent with what `/medications` and `/medications/shelf` render
  for the same data.

### Manual Testing Steps (end-to-end, after Phase 2):

1. Sign in → land on `/dashboard`.
2. With a known seeded set, confirm both counts match the run-out and shelf views.
3. Click each count → arrives at the matching view.
4. Archive/refill a med (if S-03 is present) or edit via Studio, reload
   `/dashboard` → counts reflect the change.
5. Empty account → add CTA; all-clear when nothing is low/expiring.

## Performance Considerations

One owner-scoped query (`medications_user_id_idx` present), reused from S-01/S-02;
classify + count are O(n) in memory over a small per-user list. No performance
concern at MVP scale (PRD `data_volume: small`, `qps: low`).

## Migration Notes

None — S-04 adds no schema changes and regenerates no types. It reads the existing
F-01 `medications` rows through `getActiveMedications`.

> Operational dependency (same as S-01/S-02): manual verification requires a
> locally-configured Supabase + a confirmed user (`.env` / `.dev.vars` set, local
> stack running). Auth is operationally inactive until Worker secrets +
> Supabase Auth URLs are set (deploy-plan G3/G4).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd.md` (FR-011; Business Logic — "counts of
  medications running low and expiring soon")
- Classifiers reused (guardrails live here): `src/lib/medications/forecast.ts`
  (`computeRunout`/`RunoutStatus`), `src/lib/medications/expiry.ts`
  (`classifyExpiry`/`EXPIRY_SOON_DAYS`)
- Data access: `src/lib/medications/queries.ts` (`getActiveMedications`)
- Page patterns to mirror: `src/pages/medications/index.astro`,
  `src/pages/medications/shelf.astro`; nav `src/components/Topbar.astro`
- Landing/routing touch-points: `src/middleware.ts` (the `/dashboard` redirect +
  `PROTECTED_ROUTES`), `src/pages/api/auth/signin.ts` (post-signin redirect)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Summary logic + `/dashboard` page

#### Automated

- [x] 1.1 `npx astro sync` regenerates types without error
- [x] 1.2 `npm run build` passes
- [x] 1.3 `npm run lint` passes

#### Manual

- [x] 1.4 Review `summarizeCabinet` membership rules + date parsing
- [x] 1.5 Seeded: ~10-day med counted "running low"; safe/no-forecast meds not counted
- [x] 1.6 Seeded: ~30-day + already-expired meds both counted in "expiring soon / expired"
- [x] 1.7 Count cards link to `/medications` and `/medications/shelf`
- [x] 1.8 All-clear message shows when meds exist but both counts are 0
- [x] 1.9 "Add your first medication" CTA shows on an empty account
- [x] 1.10 Query error renders the error banner (not silent zeros)
- [x] 1.11 Unauthenticated `/dashboard` redirects to `/auth/signin`

### Phase 2: Make it the landing + nav

#### Automated

- [ ] 2.1 `npx astro sync` passes
- [ ] 2.2 `npm run build` passes
- [ ] 2.3 `npm run lint` passes

#### Manual

- [ ] 2.4 Sign in lands on `/dashboard` (the summary)
- [ ] 2.5 Topbar "Summary" link appears on all authenticated views and navigates to `/dashboard`
- [ ] 2.6 Run-out list and shelf unchanged; their nav links still work
