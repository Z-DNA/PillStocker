import type { Tables } from "@/lib/database.types";

type MedicationRow = Tables<"medications">;

export type RunoutStatus = "out" | "critical" | "warning" | "safe" | "none";

export interface RunoutForecast {
  status: RunoutStatus;
  daysLeft: number | null;
  runOutDate: Date | null;
  totalDailyDose: number;
}

/**
 * Forecast a medication's run-out from its pill count and morning/midday/night
 * dosing.
 *
 * Guardrail: the prediction must never be wrong-optimistic. Days of supply are
 * floored (never rounded up), and anything at or below zero is treated as
 * already out — a false "safe" can never overstate the real supply.
 *
 * Status rules:
 * - An explicit zero pill count is always `"out"` (you have no stock),
 *   regardless of dosing.
 * - With a daily dose, the medication is forecastable; an unrecorded count is
 *   treated as zero stock (a known regimen with nothing logged reads as out).
 * - With no daily dose entered (and a non-zero / unrecorded count) there is no
 *   consumption rate to project, so the status is `"none"` (no forecast).
 */
export function computeRunout(
  med: Pick<MedicationRow, "pill_count" | "dose_morning" | "dose_midday" | "dose_night">,
  today: Date,
): RunoutForecast {
  const totalDailyDose = (med.dose_morning ?? 0) + (med.dose_midday ?? 0) + (med.dose_night ?? 0);

  // Explicit zero stock is always "out", whether or not a dose is recorded.
  if (med.pill_count === 0) {
    return { status: "out", daysLeft: 0, runOutDate: new Date(today), totalDailyDose };
  }

  // A daily dose makes the medication forecastable; an unrecorded count counts
  // as zero stock (→ floors to 0 days → "out").
  if (totalDailyDose > 0) {
    const pillCount = med.pill_count ?? 0;
    const daysLeft = Math.floor(pillCount / totalDailyDose);

    const runOutDate = new Date(today);
    runOutDate.setDate(runOutDate.getDate() + daysLeft);

    let status: RunoutStatus;
    if (daysLeft <= 0) {
      status = "out";
    } else if (daysLeft < 7) {
      status = "critical";
    } else if (daysLeft < 14) {
      status = "warning";
    } else {
      status = "safe";
    }

    return { status, daysLeft, runOutDate, totalDailyDose };
  }

  // No daily dose → no consumption rate to forecast.
  return { status: "none", daysLeft: null, runOutDate: null, totalDailyDose };
}

/**
 * Order forecasts soonest-run-out first. Forecastable rows sort by ascending
 * days left (so "out"/0 sits at the top); rows with no forecast sink last.
 */
export function compareByRunout(a: RunoutForecast, b: RunoutForecast): number {
  if (a.daysLeft !== null && b.daysLeft !== null) {
    return a.daysLeft - b.daysLeft;
  }
  if (a.daysLeft !== null) {
    return -1;
  }
  if (b.daysLeft !== null) {
    return 1;
  }
  return 0;
}
