---
project: "PillStocker"
version: 1
status: draft
created: 2026-06-03
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-06-30
  after_hours_only: false   # mix of after-hours and day-job time
---

# PillStocker — Product Requirements Document

## Vision & Problem Statement

People on multiple long-term medications (months to years) cannot easily tell when each medication will run out. Pills arrive in mismatched package sizes (e.g. 20, 14, 56) and are consumed on different schedules across morning, midday, and night — so supply depletes at different, hard-to-track rates. The shortfall is typically discovered mid-week, while loading a pill organizer, when one medication turns out to be short. Separately, there is no easy way to know what is already in the cabinet, what active substance each item contains, or when it expires — which leads to wasted expired pills and duplicate prescriptions for the same substance under a different brand name.

The insight: existing tools are dose reminders and daily trackers — they assume infinite supply and nag per dose, and they track brand names rather than active substances. None forecast depletion from package-size math plus multi-time-of-day dosing, and none deduplicate by active substance. PillStocker's gap is doing both together: supply forecasting and substance-level inventory.

## User & Persona

**Primary persona — the long-term patient.** An adult who self-manages several medications taken over months or years. They know their regimen (which pills, how many times a day) and are willing to enter their current pill counts and daily consumption. They reach for PillStocker at two moments: (1) when preparing the week's medications and wanting advance warning before any med runs short, and (2) when a doctor proposes a new prescription and they want to check whether they already hold that active substance — possibly under a different brand name — or whether something in the cabinet has expired.

## Success Criteria

### Primary
- A patient enters their medications once and, on opening the app, is reliably warned *before* any medication runs out and *before* any medication expires — eliminating mid-week surprise shortages and discovery of already-expired pills. (Proactive out-of-app notification is deferred to v2 — see FR-009.)

### Secondary
- After repeated refills over weeks, the predicted run-out dates stay trustworthy, so the patient keeps relying on PillStocker instead of counting pills manually.

### Guardrails
- Predictions are never wrong-optimistic: the app must never indicate more days of supply (or more time before expiry) than actually exist. A false "safe/green" is a regression even if every other prediction is correct.
- Data is never silently lost: a medication the user entered never vanishes, and counts and expiry dates survive refills, edits, and multi-device use without corruption.

> Note: authentication and persistent data storage are non-negotiable must-haves for this project — access control and data management are hard requirements, not optional features.

## User Stories

### US-01: Patient sees when a medication will run out

- **Given** a signed-in user who has added a medication with a pill count and a per-time-of-day dosage
- **When** they open the run-out (daily) view
- **Then** they see the medication's predicted run-out date and a colour reflecting how soon it runs out

#### Acceptance Criteria
- Predicted run-out is derived from current pill count and total daily consumption (morning + midday + night), as a scheduled-adherence estimate
- Medications are ordered soonest-run-out first
- A medication below the red threshold is visually distinct from a green one
- The prediction never indicates more days of supply than the pill count actually supports (guardrail)

### US-02: Patient is warned about expiring medications

- **Given** a signed-in user who has added a medication with an expiry date
- **When** they open the expiry (shelf) view
- **Then** they see the medication flagged by expiry proximity, ordered soonest-expiry first

#### Acceptance Criteria
- Already-expired medications are flagged distinctly from soon-to-expire ones
- Medications are ordered by expiry date, soonest first
- The expiry status never shows more time remaining than the expiry date actually allows (guardrail)

### US-03: Patient is reminded before running out, without opening the app (deferred to v2)

> Deferred to v2 (2026-06-06) alongside FR-009. Out-of-app notifications are out of MVP scope; the MVP warns in-app via the run-out view (US-01). The story and its acceptance criteria are retained for v2 planning.

- **Given** a signed-in user with a medication approaching its predicted run-out date
- **When** the run-out date falls within the user's configured reminder margin
- **Then** they receive an out-of-app notification in time to reorder or refill

#### Acceptance Criteria
- The notification fires at least the configured margin (default one week) before the predicted run-out date
- The reminder reaches the user without requiring them to open the app first
- A refill that pushes the run-out date back beyond the margin clears the pending reminder

## Functional Requirements

> Model note: a medication is **one record** that may carry an optional pill count + per-time-of-day dosage (making it visible in the run-out / "daily" view) and/or an optional expiry date (making it visible in the expiry / "shelf" view). "Daily" and "Shelf" are views over one list, not separate add flows.

### Account
- FR-001: User can create an account and sign in. Priority: must-have
  > Socrates: Counter considered — "sign-up friction may lose first-time users; holding health data server-side is a privacy liability a local app avoids." Resolution: kept; authentication and persistent storage are hard, non-negotiable requirements for this project.

### Medication entry & management
- FR-002: User can add a medication with a name, plus optional active substance, optional description, optional pill count with per-time-of-day dosage (morning/midday/night), and optional expiry date — a single record trackable for run-out, expiry, or both. Priority: must-have
  > Socrates: Counter considered — "the morning/midday/night model is too rigid for weekly, every-other-day, tapering, or as-needed (PRN) regimens." Resolution: kept the daily x-y-z model for the MVP (it fits the target long-term-daily regimens); non-daily schedules deferred to v2 (see Open Questions). Also unified per the shelf-mode challenge: count and expiry are both optional attributes of one record, not two separate add flows.
- FR-003: User can record a refill that increases a medication's pill count. Priority: must-have
  > Socrates: Counter considered — "additive refills compound counting errors; overlaps with edit." Resolution: kept; refill matches the real top-up action, and edit (FR-004) lets the user set an absolute count to correct any drift.
- FR-004: User can edit a medication's details. Priority: must-have
  > Socrates: Counter considered — "unconstrained edits could corrupt prediction integrity; overlaps with refill." Resolution: kept as written; full edit is a basic data-management expectation.
- FR-005: User can archive a medication (soft-delete), removing it from active views while preserving its record and history. Priority: must-have
  > Socrates: Counter considered — "hard delete loses refill/consumption history." Resolution: changed from hard delete to archive/soft-delete; preserves the record and aligns with the "data never silently lost" guardrail.

### Run-out prediction (daily view)
- FR-006: User can see each medication's predicted run-out date, computed from its current pill count and total daily consumption (a scheduled-adherence estimate). Priority: must-have
  > Socrates: Counter considered — "the prediction assumes perfect adherence; real skip/double doses make the date drift and erode trust." Resolution: kept as an explicit scheduled-adherence estimate; refills and edits let the user re-sync to reality; actual adherence tracking is out of scope (see Open Questions).
- FR-007: User can see medications colour-coded by run-out proximity using fixed default thresholds (green ≥14 days, yellow 7–14, red <7). Priority: must-have
  > Socrates: Counter considered — "configurable thresholds are premature for v1." Resolution: ship fixed default thresholds in v1; threshold customization demoted to nice-to-have (FR-012).
- FR-008: User can see medications ordered by run-out date, soonest first. Priority: must-have
  > Socrates: Counter considered — "a single fixed sort is too rigid for a large list." Resolution: kept soonest-first as the v1 default; additional sort/grouping options deferred to v2.
- FR-009: User receives an out-of-app notification (push/OS/email) before a medication runs out, with a configurable margin. Priority: nice-to-have (deferred to v2)
  > Socrates: Counter considered — "an in-app-only reminder never reaches a user who forgets to open the app — which is the whole problem." Resolution: changed from in-app to an out-of-app notification. Accepted as the single biggest new cost surfaced in this round.
  > Deferred to v2 (2026-06-06): out-of-app notification — together with its unresolved delivery channel (Open Question 4; no SMTP on Cloudflare Workers) — is the largest cost and reliability surface in the MVP and is cut to protect the 3-week timeline. The MVP delivers the run-out warning in-app via the daily view (FR-006–FR-008); proactive notification ships in v2.

### Expiry tracking (shelf view)
- FR-010: User can see medications that have an expiry date flagged as soon-to-expire or expired, colour-coded and ordered by expiry date (soonest first). Priority: must-have
  > Socrates: Counter considered — "manual expiry entry is tedious and may be skipped, leaving the feature empty; expiry is already printed on the package." Resolution: kept; expiry is an optional attribute and the value is the whole-cabinet expiry view the package can't provide. Adoption risk accepted.

### Summary
- FR-011: User can see a minimal summary landing screen showing counts of medications running low and medications expiring soon. Priority: must-have
  > Socrates: Counter considered — "a summary screen is derivative and could be cut from a 3-week MVP." Resolution: kept minimal — a bare counts-only landing screen ("X running low, Y expiring soon"), cheap to build and a useful daily anchor.

### Configurability (deferred)
- FR-012: User can customize the colour-coding thresholds. Priority: nice-to-have
  > Socrates: Spun off from the FR-007 configurability challenge — threshold customization is real but premature for v1; deferred so the MVP ships fixed defaults.

### Inventory intelligence (deferred)
- FR-013: User can check whether they already hold a given active substance (duplicate detection by user-entered substance; no external drug database). Priority: nice-to-have
  > Socrates: Counter considered — "relies on an optional user-entered field, risking a false 'all clear'; would need a real drug database to be trustworthy." Resolution: kept deferred to v2; if built, the false-reassurance risk must be scoped (e.g., only claim 'no duplicate among the substances you have entered').

## Non-Functional Requirements

- Medication data is readable only by its owner: it is never exposed to another user and never readable by anyone — including operators — while in transit or at rest.
- Once saved, a medication and its pill count and expiry date persist across sessions and across the user's devices with no loss or corruption.

> Deferred to v2 (with FR-009): an out-of-app run-out reminder must reach the user no later than the configured margin (default one week) before a medication's predicted run-out date; a reminder that arrives late or not at all is a failure. This timeliness guarantee takes effect once notifications ship in v2.

## Business Logic

**PillStocker computes, for each medication, how many days of supply remain (pill count ÷ total scheduled daily dose) and how close it is to its expiry date, classifies each medication as safe / warning / critical against those two timelines, and alerts the user before either threshold is crossed.**

The rule consumes user-supplied inputs only: for each medication, the current pill count and the daily dosage split across morning, midday, and night (for the run-out timeline), and/or an expiry date (for the shelf timeline). Refills increase the count; edits correct it.

The output, per medication, is a number of days of supply remaining and/or days until expiry, plus a status — safe, warning, or critical — derived by comparing those numbers against the threshold bands and the user's reminder margin.

The user encounters the rule two ways in the MVP: each medication appears colour-coded and ordered by urgency in the relevant view, and the landing screen shows counts of medications running low and expiring soon. (A third path — an out-of-app notification when a medication enters the reminder window ahead of its predicted run-out — is deferred to v2 with FR-009.)

## Access Control

Account-based: the patient signs up and signs in to reach the app; their medication data is bound to their account and available on any device after sign-in. Flat single-role model — every authenticated user manages only their own medication cabinet, with no admin, sharing, or caregiver role in the MVP. Unauthenticated visitors cannot reach medication data; all medication views are gated behind sign-in. Because the stored data is sensitive health information, confidentiality of stored data and of data in transit is a binding guardrail (stated as a Non-Functional Requirement).

## Non-Goals

- **No external drug database** — substance and duplicate detection stay purely user-entered; the MVP will not build or integrate a brand→active-substance database. Bounds the deferred v2 substance-check feature (FR-013).
- **No caregiver or shared accounts** — single-user only; no managing another person's medications, no sharing, no family or admin roles. Locks the flat-user model.
- **No adherence / intake tracking** — the app predicts from scheduled dosing and will not record whether each dose was actually taken. Run-out stays a scheduled-adherence estimate.
- **No pharmacy integration or automatic reordering** — no pharmacy connections, refill ordering, or prescription sync. The app warns; the user acts.
- **No non-daily dosing schedules in v1** — weekly, every-other-day, tapering, and as-needed (PRN) regimens are out of MVP scope (see Open Question 1).
- **No native mobile app in v1** — PillStocker ships as a web app; a native iOS/Android app is out of MVP scope (follows from the web-app product type).

## Open Questions

1. **Non-daily dosing schedules** — the MVP models only morning/midday/night daily dosing. Weekly, every-other-day, tapering, and as-needed (PRN) regimens are unsupported. Owner: user. Deferred to v2 unless a target user needs it sooner.
2. **Adherence drift** — run-out prediction assumes the user takes the scheduled dose every day. Real skip/double doses are not tracked; the user re-syncs via refills/edits. Owner: user. Revisit if predictions prove untrustworthy in practice.
3. **Expiry notifications** — expiry is surfaced visually (FR-010); out-of-app notification (run-out and expiry alike) is deferred to v2. Owner: user. Decide notification scope in v2.
4. **Notification channel** — FR-009 (deferred to v2) specifies an out-of-app notification but not the channel; note there is no SMTP on Cloudflare Workers, so v2 needs an HTTP email/push provider. Owner: v2 planning.

_Resolved during shaping: health-data confidentiality (formerly a fifth open question) was promoted to a hard Non-Functional Requirement — owner-only readability, no exposure in transit or at rest._
