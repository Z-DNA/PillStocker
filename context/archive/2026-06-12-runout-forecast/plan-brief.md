# Run-out Forecast (S-01) — Plan Brief

> Full plan: `context/changes/runout-forecast/plan.md`

## What & Why

PillStocker's **north star** slice: a signed-in user adds a medication with its pill count and morning/midday/night dosing, then sees its predicted run-out date — colour-coded by proximity and ordered soonest-first. This is the product wedge (forecasting depletion from package-count ÷ multi-time-of-day dosing) and the validation milestone for the PRD's primary Success Criterion: a patient is reliably warned *before* a medication runs out. (US-01, FR-001/002/006/007/008.)

## Starting Point

The F-01 `medications` table is live with owner-only RLS and generated types, but **no query/CRUD code exists** — this is the first read/write against it. There's a strong form pattern to copy (auth: React island → native POST → server handler → redirect with `?error=`), CVA UI primitives, and a null-safe per-request `createClient`. `/dashboard` is a placeholder; post-signin lands on `/`. No test runner.

## Desired End State

`/medications` is the authenticated landing: empty state with an add CTA when fresh; otherwise a list of colour-coded rows (green ≥14 / yellow 7–13 / red <7) each showing run-out date + "N days left", soonest-first, with **"Out now"** pinned top and **"No forecast"** rows neutral and last. `/medications/new` adds a med that persists and appears forecasted. The floor guardrail holds (10 pills @ 1/1/1 → 3 days, not 4).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Add-form fields | Name + count + morning/midday/night + substance + description (no expiry) | Matches FR-002's single record; expiry stays for S-02's shelf view | Plan |
| Run-out view route | New `/medications`; `/dashboard` + post-signin redirect to it | Frees `/dashboard` for the S-04 summary; clean view-per-route | Plan |
| Add UX | Separate `/medications/new` page + API POST + redirect | Mirrors the existing auth pattern exactly; no new client fetch pattern | Plan |
| Non-forecastable meds | Show "No forecast", sorted last | Never hides a med, never shows a false green, nudges completing data | Plan |
| Add validation | Name only required (count/doses optional, non-negative) | Matches FR-002 optionality and the No-forecast decision | Plan |
| Row display | Run-out date + days-left + colour | Date for planning, days for urgency, colour for scan — one computation | Plan |
| Already-out meds | Distinct "Out now" label (red bucket), pinned top | The exact failure the product prevents — never wrong-optimistic | Plan |
| Guardrail location | `floor()` + banding in one pure `forecast.ts` | Single reviewable home for the never-optimistic invariant | Plan |

## Scope

**In scope:** pure forecast module + typed query/create helpers; `/medications` list (forecast + colour + sort + empty state); `/medications/new` + `AddMedicationForm` + `POST /api/medications`; middleware gating; dashboard/post-signin redirects.

**Out of scope:** expiry/shelf (S-02), refill/edit/archive (S-03), summary counts (S-04), notifications/thresholds/substance-dedup/non-daily dosing (v2), per-row actions, `locals.supabase`, new test runner.

## Architecture / Approach

Data → logic → read → write. A pure `forecast.ts` (the guardrail) and typed `queries.ts` come first. The `/medications` SSR page queries active meds (RLS-scoped), forecasts each against one server-side "today", sorts soonest-first, and renders colour-coded `MedicationCard`s. The add flow copies the auth island→POST→redirect pattern; the API route self-guards (it sits under `/api/`, outside the `PROTECTED_ROUTES` prefix) and sets `user_id` from `locals.user`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Forecast logic + helpers | Pure `computeRunout`/comparator + `getActiveMedications`/`createMedication` + types | Guardrail wrong (must floor, never round) — mitigated by isolating it + review |
| 2. List view + routing | `/medications` colour-coded sorted list, gating, redirects | Off-by-one in date/day-band math; verified via seeded rows |
| 3. Add flow | `/medications/new` + form + self-guarding API | Validation gaps / missing auth guard on the API route |

**Prerequisites:** F-01 done (it is). Local Supabase + configured auth (env vars, a confirmed user) for manual verification — auth is code-present but operationally inactive until Worker secrets/Auth URLs (G3/G4) are set.
**Estimated effort:** Small–medium — roughly one focused session across the three phases.

## Open Risks & Assumptions

- Auth operationally inactive until G3/G4 — end-to-end manual checks need local config.
- Date math is date-granular UTC; a sub-24h timezone off-by-one is an accepted MVP risk.
- No automated regression guard (no test runner) — the floor guardrail is protected by review + Phase 3 manual spot-check.

## Success Criteria (Summary)

- A signed-in user adds a med and immediately sees a trustworthy, never-optimistic run-out date, colour-coded and sorted soonest-first.
- "Out now" and "No forecast" states behave as specified; only the owner's active meds appear.
- `astro sync` / `build` / `lint` pass.
