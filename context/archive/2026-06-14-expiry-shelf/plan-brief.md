# Expiry Shelf (S-02) — Plan Brief

> Full plan: `context/changes/expiry-shelf/plan.md`

## What & Why

PillStocker tracks each medication as one record that can carry a pill count (run-out timeline) and/or an expiry date (shelf timeline). S-01 shipped the run-out view; S-02 adds the **second view over the same list**: a signed-in user records an optional expiry date and sees a shelf flagging each dated medication as expired or soon-to-expire, so they catch expired stock before taking or re-buying it (US-02, FR-010).

## Starting Point

S-01 shipped the full run-out vertical (logic, list page, add flow) against the F-01 `medications` table. That table **already has the `expiry_date` column** (F-01 shipped the complete field set), but nothing reads or writes it yet, and there is no expiry logic, view, or form field.

## Desired End State

A signed-in user opens `/medications/shelf` and sees every medication that has an expiry date, colour-banded (red Expired / amber Soon / green OK), ordered soonest-expiry first with expired items pinned on top, each showing its date and a relative phrase ("Expires in N days"). They set the date via a new optional field on the existing add form. Meds with no expiry date stay in the run-out view only; the run-out view itself is unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Shelf placement | Separate `/medications/shelf` page | Matches the PRD's "two views over one list" framing and barely touches the run-out card S-03 will edit | Plan |
| Run-out view | Left unchanged | Keeps S-02 scoped with zero regression risk to the north-star view | Plan |
| Shelf membership | Only meds with an expiry date | Matches FR-010's "medications that have an expiry date"; undated meds belong to the run-out view | Plan |
| Expiry input | Optional field on the add form; edit deferred to S-03 | Matches FR-002 (one add flow, optional field) and avoids the shared edit-surface conflict with S-03 | Plan |
| Classification | Expired / Soon (≤90 days) / OK | Three bands meet US-02; 90-day window suits months/years expiry scale (run-out's 7/14-day bands don't transfer) | Plan |
| Past dates on entry | Allowed → shown "Expired" | Surfaces already-expired stock immediately, which is the whole point of the shelf | Plan |
| Row detail | Date + relative phrase | Consistent with the run-out card's "N days left"; gives at-a-glance urgency | Plan |

## Scope

**In scope:** pure expiry classifier + comparator (guardrail's home); new `ExpiryCard`; `/medications/shelf` page; Topbar link; optional `expiry_date` field through the add form → API → create contract.

**Out of scope:** editing/changing expiry (S-03); summary counts (S-04); any change to the run-out view or `MedicationCard`; configurable thresholds (FR-012); two-tier "soon" bands; notifications (FR-009); a dedicated DB-side shelf query.

## Architecture / Approach

Mirror the S-01 run-out vertical layer-for-layer. New `expiry.ts` (`classifyExpiry` + `compareByExpiry`) parallels `forecast.ts`. The shelf page reuses the existing `getActiveMedications` query and filters `expiry_date !== null` in memory (small data volume), classifies against a single server-side "today", and renders a new `ExpiryCard` — keeping S-02 off the shared run-out card. The write path adds one optional field threaded through `NewMedicationInput` → API parse → add form. `/medications/shelf` needs no middleware change (covered by the existing `/medications` prefix).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Logic + shelf view (read) | `expiry.ts`, `ExpiryCard`, `/medications/shelf`, Topbar link — verified by seeding dates in Studio | Guardrail correctness (date-granular `daysUntil`, no round-up; today = "Soon" not "Expired") |
| 2. Add-path expiry field (write) | `expiry_date` through create contract → API → add form; closes the loop | Empty date string must store `null`, not a bogus date; existing add flow must stay intact |

**Prerequisites:** F-01 (done) and S-01 (done); a locally-configured Supabase + confirmed user for manual verification.
**Estimated effort:** ~1–2 sessions across 2 phases — small, every layer mirrors an existing S-01 pattern.

## Open Risks & Assumptions

- **Timezone off-by-one:** "today" vs the date-only `expiry_date` is compared at date granularity (UTC-midnight diff); a sub-24h boundary case is an accepted MVP risk (same stance as S-01).
- **Adoption:** manual expiry entry may be skipped, leaving the shelf sparse — accepted per FR-010; the value is the whole-cabinet view a package can't give.
- **Assumption:** `FormField` forwards `type="date"` to the input as it already does for `type="number"`.

## Success Criteria (Summary)

- A medication with an expiry date appears on the shelf, correctly banded and ordered soonest-first, with expired items distinct and on top (US-02 AC1/AC2).
- The expiry status never overstates time remaining — a med expiring in 5d 23h shows 5 days, and one expiring today reads "Soon"/0, never "Expired" (US-02 AC3 guardrail).
- Adding an expiry date through the UI is the path to the shelf; the run-out view and existing add flow are unchanged.
