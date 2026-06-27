import type { Tables } from "@/lib/database.types";
import { computeRunout } from "@/lib/medications/forecast";
import { classifyExpiry } from "@/lib/medications/expiry";

type MedicationRow = Tables<"medications">;

export interface CabinetSummary {
  total: number;
  runningLow: number;
  expiringSoon: number;
}

/**
 * Aggregate the active-medication rows into the two cabinet-summary counts.
 *
 * This adds no new forecasting/classification logic — it reuses `computeRunout`
 * and `classifyExpiry` so the count definitions live in one reviewable place and
 * inherit both classifiers' never-wrong-optimistic guardrails.
 *
 * - `total` = `meds.length` (already active; `getActiveMedications` filters
 *   `archived_at IS NULL`), used only for the empty-account decision.
 * - `runningLow` = meds below the green band: run-out status in
 *   `{ warning, critical, out }` (`< 14` days left). `safe` (≥14d) and `none`
 *   (no forecast) are excluded.
 * - `expiringSoon` = meds with a non-null `expiry_date` whose expiry status is in
 *   `{ soon, expired }`. Folding `expired` in is the guardrail: an already-expired
 *   med must never be silently dropped from the summary.
 */
export function summarizeCabinet(meds: MedicationRow[], today: Date): CabinetSummary {
  let runningLow = 0;
  let expiringSoon = 0;

  for (const med of meds) {
    const runout = computeRunout(med, today);
    if (runout.status === "warning" || runout.status === "critical" || runout.status === "out") {
      runningLow += 1;
    }

    if (med.expiry_date !== null) {
      // Construct from local date parts so a "YYYY-MM-DD" date column value is
      // not shifted a day by UTC parsing of new Date(string) — same as shelf.astro.
      const [year, month, day] = med.expiry_date.split("-").map(Number);
      const expiryDate = new Date(year, month - 1, day);
      const expiry = classifyExpiry(expiryDate, today);
      if (expiry.status === "soon" || expiry.status === "expired") {
        expiringSoon += 1;
      }
    }
  }

  return { total: meds.length, runningLow, expiringSoon };
}
