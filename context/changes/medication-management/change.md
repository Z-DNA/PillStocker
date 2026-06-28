---
change_id: medication-management
title: Medication management
status: impl_reviewed
created: 2026-06-27
updated: 2026-06-28
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap slice S-03 (PRD FR-003 refill, FR-004 edit, FR-005 archive). Planned 2026-06-27 via `/10x-plan`.

### Post-review adjustments (2026-06-28, PO manual testing)

- **Return to origin after manage actions.** Edit / refill / archive now redirect
  back to the launching view (run-out list or shelf) via a `from` token threaded
  through the manage page, mirroring the add flow. Previously all three hardcoded
  a return to `/medications`. Origin helper extracted to
  `src/lib/medications/navigation.ts` (`returnPathFor`), shared by all four write
  paths (create/edit/refill/archive).
- **Refill accepts signed adjustments.** The refill control now takes any
  non-zero whole number; a negative value corrects the count down, rejected only
  if the resulting total would drop below 0 (guard in `refillMedication`). PRD
  FR-003 was reworded to match (signed stock adjustment, total ≥ 0) on
  2026-06-28.

### Deferred to next slice — forecast staleness (CRITICAL, PO-flagged)

`computeRunout` (`src/lib/medications/forecast.ts`) recomputes
`daysLeft = floor(pill_count / dailyDose)` and `runOutDate = today + daysLeft` on
every render from the **static** stored `pill_count`. Consumption is never
deducted as time passes, so the prediction never counts down — the run-out date
slides forward one day per day and the card "always shows the same days left,"
undermining the product's core run-out-forecasting value. Fix belongs in a new
slice: anchor the count to a reference timestamp and derive
`remaining = stored − elapsed_days × dailyDose` so the forecast counts down to a
fixed date (touches schema + db:types + forecast + edit/refill writes). Tracked
as a background task; route through `/10x-shape` → `/10x-plan` and add to
`context/foundation/roadmap.md`.
