export type ExpiryStatus = "expired" | "soon" | "ok";

export interface ExpiryClassification {
  status: ExpiryStatus;
  daysUntil: number;
  expiryDate: Date;
}

/**
 * A medication is "soon to expire" once it is within this many days of its
 * expiry date. Fixed default — configurable thresholds are deferred (FR-012).
 * Medications expire on a months/years scale, so the run-out view's 7/14-day
 * bands do not transfer here.
 */
export const EXPIRY_SOON_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * Collapse a Date to the UTC midnight of its local calendar day. Differencing
 * two of these yields an exact whole-day count with no DST half-day drift.
 */
function toUtcDay(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Classify a medication by how close it is to its expiry date.
 *
 * Guardrail: the status must never show more time remaining than the expiry
 * date actually allows. `daysUntil` is computed at date granularity (UTC
 * midnight to UTC midnight), so a sub-24h remainder is never rounded up — a
 * med with 5 days and 23 hours left reads as 5 days, not 6.
 *
 * Bands: a date in the past (`daysUntil < 0`) is `"expired"`; a date today or
 * within `EXPIRY_SOON_DAYS` is `"soon"` (expiring today reads 0 days, never
 * expired); anything further out is `"ok"`.
 */
export function classifyExpiry(expiryDate: Date, today: Date): ExpiryClassification {
  // Both operands are exact UTC midnights, so the difference is an exact
  // multiple of DAY_MS; Math.round just strips floating-point dust.
  const daysUntil = Math.round((toUtcDay(expiryDate) - toUtcDay(today)) / DAY_MS);

  let status: ExpiryStatus;
  if (daysUntil < 0) {
    status = "expired";
  } else if (daysUntil <= EXPIRY_SOON_DAYS) {
    status = "soon";
  } else {
    status = "ok";
  }

  return { status, daysUntil, expiryDate };
}

/**
 * Order classifications soonest-expiry first: ascending days-until, so
 * already-expired rows (most negative) sit at the top.
 */
export function compareByExpiry(a: ExpiryClassification, b: ExpiryClassification): number {
  return a.daysUntil - b.daysUntil;
}
