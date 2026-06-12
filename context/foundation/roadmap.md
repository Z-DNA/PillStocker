---
project: PillStocker
version: 1
status: draft
created: 2026-06-12
updated: 2026-06-12
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: PillStocker

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

PillStocker helps people on multiple long-term medications see, in one place, when each medication will run out and when it will expire — surfacing shortfalls *before* the mid-week pill-organizer moment when one med turns out to be short, and flagging expired stock before it is taken or re-bought. The product **wedge** — the one trait that, if removed, makes PillStocker indistinguishable from an ordinary dose-reminder app — is doing two things existing tools don't: forecasting depletion from package-size math plus morning/midday/night dosing, and tracking inventory by active substance rather than brand name. The MVP delivers the forecasting and expiry halves; substance-level deduplication and out-of-app reminders are deferred to v2.

## North star

**S-01: user adds a medication with its daily dosing and immediately sees its predicted run-out date, colour-coded and ordered soonest-first.** This is the validation milestone, tied to the primary Success Criterion (a patient is reliably warned before a medication runs out).

> The **north star** here is the smallest end-to-end slice whose success would prove the core idea works — that PillStocker can forecast run-out from pill count plus morning/midday/night dosing — placed as early as its prerequisites allow, because everything else only matters if this forecasting works. It exercises the full stack top-to-bottom (data → forecasting logic → daily view) on the product wedge.

## At a glance

| ID    | Change ID              | Outcome (user can …)                                                          | Prerequisites    | PRD refs                                | Status   |
| ----- | ---------------------- | ----------------------------------------------------------------------------- | ---------------- | --------------------------------------- | -------- |
| F-01  | medication-data-model  | (foundation) medication record schema with owner-only RLS + soft-delete; typed access | —        | FR-002, FR-005, NFR                     | done     |
| S-01  | runout-forecast        | add a med with dosing and see its predicted run-out date, colour-coded & sorted | F-01           | US-01, FR-001, FR-002, FR-006, FR-007, FR-008 | ready    |
| S-02  | expiry-shelf           | see meds with expiry dates flagged (expired vs soon) and sorted soonest-first  | F-01, S-01      | US-02, FR-002, FR-010                   | proposed |
| S-03  | medication-management  | refill, edit, and archive (soft-delete) a medication                           | F-01, S-01      | FR-003, FR-004, FR-005                  | proposed |
| S-04  | cabinet-summary        | see a landing screen counting meds running low and expiring soon               | F-01, S-01, S-02 | FR-011                                  | proposed |

## Baseline

What's already in place in the codebase as of `2026-06-12` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + Tailwind 4, file-based routing (`astro.config.mjs`). Minimal UI primitives (`src/components/ui/button.tsx` — CVA + Radix Slot; `LibBadge.astro`); `dashboard.astro` exists but is generic — no medication UI yet.
- **Backend / API:** present — Astro SSR + Cloudflare adapter; `src/middleware.ts` gates `PROTECTED_ROUTES` (`["/dashboard"]` today); only `/api/auth/*` handlers exist.
- **Data:** partial — Supabase client wired for AUTH ONLY (`src/lib/supabase.ts`); no schema, migrations, `*.sql`, domain model, or generated DB types. The domain data layer is empty.
- **Auth:** present (pending activation) — Supabase Auth wired end-to-end: signup/signin/signout under `/api/auth/*`, null-safe client, middleware `getUser`. Operationally inactive until Worker secrets + Supabase Auth URLs are set (deploy-plan G3/G4).
- **Deploy / infra:** present — Cloudflare Workers, live at `pillstocker.z-dna.dev`; CI runs lint/build/deploy (`.github/workflows/ci.yml`). No cron triggers (FR-009 deferred to v2).
- **Observability:** partial — Cloudflare observability enabled (`wrangler.jsonc`); no Sentry/Datadog/OTel and no app-level error tracking.

## Foundations

### F-01: Medication record data model

- **Outcome:** (foundation) the medication record schema is live in the data layer — one record per FR-002's model (name; optional active substance, description; optional pill count + morning/midday/night dosing; optional expiry date) — with owner-scoped row-level security and a soft-delete/archive flag, plus generated typed access. Not user-visible on its own.
- **Change ID:** medication-data-model
- **PRD refs:** FR-002 (record model), FR-005 (archive/soft-delete support), NFR (owner-only readability; persistence with no loss or corruption)
- **Unlocks:** S-01 (north star), S-02, S-03, S-04 — every medication read/write depends on this record. Enforces the owner-only confidentiality NFR (via RLS) and the "data never silently lost" guardrail (soft-delete + durable persistence).
- **Prerequisites:** — (auth scaffold present per Baseline; the Supabase data layer is otherwise empty)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every slice reads/writes this one record; establishing owner-scoped RLS correctly here once is safer than retrofitting confidentiality per-slice on sensitive health data. Kept minimal — table + RLS + types, not a complete data layer; each downstream slice still exercises it through a real user capability. The load-bearing risk is an under-specified schema forcing a mid-build migration, so the FR-002 field set is settled here.
- **Status:** done

## Slices

### S-01: Run-out forecast (add + daily view)  ★ north star

- **Outcome:** user adds a medication with a pill count and morning/midday/night dosing, then sees its predicted run-out date, colour-coded by proximity (green ≥14 days / yellow 7–14 / red <7) and ordered soonest-run-out first.
- **Change ID:** runout-forecast
- **PRD refs:** US-01, FR-001, FR-002, FR-006, FR-007, FR-008
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Auth is code-present but operationally inactive — Worker secrets (`SUPABASE_URL`/`SUPABASE_KEY`) and Supabase Auth URLs (deploy-plan G3/G4) must be set before any signed-in flow verifies end-to-end. Owner: user. Block: no.
- **Risk:** The north star and the product wedge; sequenced as early as F-01 allows. Load-bearing guardrail: the run-out estimate must never be wrong-optimistic — days-of-supply must floor (never round up), so a "green/safe" can never overstate the real supply (a false safe is a regression). New medication routes must be added to `PROTECTED_ROUTES` (auth gating) per the project's middleware convention.
- **Status:** ready

### S-02: Expiry shelf view

- **Outcome:** user records an expiry date on a medication and sees a shelf view that flags expired vs soon-to-expire items, colour-coded and ordered soonest-expiry first.
- **Change ID:** expiry-shelf
- **PRD refs:** US-02, FR-002, FR-010
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends on S-01 for the shared add-medication flow (extended here with the optional expiry field) and the medication-list shell. Guardrail: expiry status must never show more time remaining than the date allows. Lower domain-logic risk than S-01 (date comparison, no dosing math). The adoption risk that manual expiry entry gets skipped is accepted per FR-010 — the value is the whole-cabinet view a package can't provide.
- **Status:** proposed

### S-03: Medication management (refill, edit, archive)

- **Outcome:** user can record a refill that increases a medication's pill count, edit any medication's details, and archive a medication (soft-delete) so it leaves active views while its record and history are preserved.
- **Change ID:** medication-management
- **PRD refs:** FR-003, FR-004, FR-005
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Supports the secondary Success Criterion — refills and edits keep predictions trustworthy over time. Bundles three management actions on one record (refill, edit, archive) that share the edit surface; if `/10x-plan` finds this too broad, it may split into separate changes. Guardrail: archive is soft-delete, so a medication never vanishes; refills are additive and edits set an absolute count to correct drift.
- **Status:** proposed

### S-04: Cabinet summary landing

- **Outcome:** user lands on a minimal summary screen showing counts of medications running low and medications expiring soon.
- **Change ID:** cabinet-summary
- **PRD refs:** FR-011
- **Prerequisites:** F-01, S-01, S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced last because it aggregates the classifications produced by both the run-out view (S-01) and the expiry view (S-02). Kept deliberately minimal per FR-011 (counts only) — a cheap daily anchor, not a dashboard. Risk is scope creep toward a fuller dashboard; resist it for the MVP.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                          | Ready for `/10x-plan` | Notes |
| ---------- | ---------------------- | ---------------------------------------------- | --------------------- | ----- |
| F-01       | medication-data-model  | Medication record schema + owner-only RLS      | done                  | Done — archived 2026-06-12 → `context/archive/2026-06-12-medication-data-model/` |
| S-01       | runout-forecast        | Add medication + run-out forecast (daily view) | yes                   | North star; F-01 done — run `/10x-plan runout-forecast` |
| S-02       | expiry-shelf           | Expiry shelf view                              | no                    | After S-01; parallel with S-03 |
| S-03       | medication-management  | Refill, edit, and archive medications          | no                    | After S-01; parallel with S-02 |
| S-04       | cabinet-summary        | Summary landing (running-low / expiring counts) | no                   | After S-01 + S-02 |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. One row per `F-NN`/`S-NN`; copy a row into an issue, do not duplicate the detailed body.

## Open Roadmap Questions

All four are lifted from the PRD's `## Open Questions`. None blocks an MVP slice — each gates v2 or parked scope, so no slice above is marked `blocked`.

1. **Non-daily dosing schedules** (weekly, every-other-day, tapering, as-needed/PRN). The MVP models only morning/midday/night daily dosing. Owner: user. Block: none — gates a v2 dosing-model expansion, not any MVP slice.
2. **Adherence drift** — run-out assumes the scheduled dose is taken every day; skips/doubles are untracked and the user re-syncs via refill/edit. Owner: user. Block: none — revisit only if predictions prove untrustworthy in practice.
3. **Expiry notifications scope** — expiry is surfaced visually (FR-010); whether it gets its own out-of-app push is a v2 decision. Owner: user. Block: none (v2).
4. **Notification channel** — FR-009 (v2) needs an HTTP email/push provider; there is no SMTP on Cloudflare Workers. Owner: v2 planning. Block: none for MVP — gates deferred FR-009 / US-03.

## Parked

- **Out-of-app run-out notifications (FR-009) + US-03** — Why parked: deferred to v2; the largest cost/reliability surface in the MVP, cut to protect the 3-week timeline. Needs an HTTP notification channel (no SMTP on Workers) and a guard against the never-late guarantee.
- **Configurable colour thresholds (FR-012)** — Why parked: nice-to-have; the MVP ships fixed defaults (green ≥14d / yellow 7–14 / red <7).
- **Substance duplicate detection (FR-013)** — Why parked: nice-to-have, v2; if built, the false-reassurance risk must be scoped ("no duplicate among substances you have entered").
- **No external drug database** — Why parked: PRD §Non-Goals; substance and duplicate detection stay purely user-entered.
- **No caregiver or shared accounts** — Why parked: PRD §Non-Goals; single-user flat-role model only.
- **No adherence / intake tracking** — Why parked: PRD §Non-Goals; run-out stays a scheduled-adherence estimate.
- **No pharmacy integration or automatic reordering** — Why parked: PRD §Non-Goals; the app warns, the user acts.
- **No non-daily dosing schedules in v1** — Why parked: PRD §Non-Goals (see Open Roadmap Question 1).
- **No native mobile app in v1** — Why parked: PRD §Non-Goals; PillStocker ships as a web app.

## Done

- **F-01: (foundation) medication record schema with owner-only RLS + soft-delete; typed access** — Archived 2026-06-12 → `context/archive/2026-06-12-medication-data-model/`. Lesson: —.
