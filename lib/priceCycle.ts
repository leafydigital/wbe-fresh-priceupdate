/**
 * WBE Fresh's business cycle does not follow calendar days:
 *
 *   3:00 PM  (Asia/Kolkata) ──► a new price becomes active
 *   next day 1:00 PM        ──► that price/order window closes
 *   3:00 PM                 ──► the next cycle begins
 *
 * This file is the ONLY place that business logic is computed. Every
 * route and page that needs "is this price still valid," "what's
 * the current cycle," or "has today's update happened yet" imports
 * from here — nothing scatters this math into components or API
 * routes directly, per the requirement that this stay centralized.
 *
 * All functions are pure (no I/O, no Date.now() called implicitly —
 * "now" is always passed in) so they're trivially testable and never
 * accidentally depend on the server's local timezone. Every
 * comparison happens in Asia/Kolkata wall-clock time regardless of
 * what timezone the Node process itself runs in.
 */

const TIMEZONE = "Asia/Kolkata";
const CYCLE_START_HOUR = 15; // 3:00 PM
const CYCLE_END_HOUR = 13; // 1:00 PM (next day)
const ORDER_CUTOFF_HOUR = 13; // 1:00 PM (same day as the order window)

export type PriceCycle = {
  /** The exact instant this cycle's 3 PM began. */
  cycleStart: Date;
  /** The exact instant this cycle closes (next day, 1 PM). */
  validUntil: Date;
};

export type OrderWindow = {
  windowStart: Date;
  cutoff: Date;
};

/**
 * Returns the IST wall-clock date/time parts for a given instant,
 * without needing an external timezone library — Intl.DateTimeFormat
 * with timeZone: "Asia/Kolkata" is available in every Node/Next.js
 * runtime this app targets, and is DST-proof by construction since
 * India has no DST.
 */
function istParts(instant: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Intl can format midnight as "24" for hour12: false in some
    // environments; normalize that to 0 so downstream math is sane.
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/**
 * Builds a UTC Date instant corresponding to a specific IST
 * wall-clock date and hour. India has a fixed UTC+5:30 offset with
 * no DST, so this is a simple, always-correct arithmetic shift —
 * no timezone database lookup needed for the conversion itself
 * (only for READING the current wall-clock time above, which uses
 * Intl, the actual source of timezone-correctness in this file).
 */
function istWallClockToUtc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  // Construct as if it were UTC, then subtract the +5:30 IST offset
  // to get the true UTC instant that wall-clock time represents.
  const asIfUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const IST_OFFSET_MINUTES = 5 * 60 + 30;
  return new Date(asIfUtc.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
}

function addDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
  // Use a UTC-based Date purely as a calendar calculator (no
  // timezone semantics involved here, just date arithmetic).
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The current price cycle, as of `now`.
 *
 * If it's currently >= 3:00 PM IST, the cycle that started TODAY at
 * 3 PM is current, valid until tomorrow 1 PM.
 * If it's currently < 3:00 PM IST, the cycle that started YESTERDAY
 * at 3 PM is (still) current, valid until today 1 PM.
 */
export function getCurrentCycle(now: Date): PriceCycle {
  const ist = istParts(now);

  if (ist.hour >= CYCLE_START_HOUR) {
    const cycleStart = istWallClockToUtc(ist.year, ist.month, ist.day, CYCLE_START_HOUR);
    const tomorrow = addDays(ist.year, ist.month, ist.day, 1);
    const validUntil = istWallClockToUtc(tomorrow.year, tomorrow.month, tomorrow.day, CYCLE_END_HOUR);
    return { cycleStart, validUntil };
  }

  const yesterday = addDays(ist.year, ist.month, ist.day, -1);
  const cycleStart = istWallClockToUtc(yesterday.year, yesterday.month, yesterday.day, CYCLE_START_HOUR);
  const validUntil = istWallClockToUtc(ist.year, ist.month, ist.day, CYCLE_END_HOUR);
  return { cycleStart, validUntil };
}

/**
 * Case 1 vs. Case 2 from the spec: has the cycle that SHOULD be
 * active right now actually been saved to the database yet?
 *
 * `latestSavedCycleStart` is whatever cycle_start the most recent
 * daily_prices row for a vegetable actually has (or null if no
 * price has ever been saved for it at all). If it matches the
 * cycle getCurrentCycle() computes for `now`, today's update has
 * happened (Case 1, normal/green styling). If it's earlier — i.e.
 * we're past 3 PM but the latest saved price still belongs to
 * yesterday's cycle — today's update is still pending (Case 2, red
 * styling), but the LATEST SAVED PRICE is still what must be shown;
 * never zero, never hidden.
 */
export function isCycleUpdatePending(latestSavedCycleStart: Date | null, now: Date): boolean {
  if (!latestSavedCycleStart) return true; // never priced at all — nothing to show as "current" yet
  const current = getCurrentCycle(now);
  return latestSavedCycleStart.getTime() < current.cycleStart.getTime();
}

/**
 * The order-collection window: opens when the price cycle opens
 * (3 PM) and closes at 1 PM the following day — same shape as the
 * price cycle, but kept as its own function (not a re-export of
 * getCurrentCycle) because the business meaning is different
 * ("orders close" vs. "price validity ends") even though the
 * numbers happen to be identical today. If WBE Fresh ever decouples
 * these two cutoffs, only this function needs to change.
 */
export function getCurrentOrderWindow(now: Date): OrderWindow {
  const cycle = getCurrentCycle(now);
  return { windowStart: cycle.cycleStart, cutoff: cycle.validUntil };
}

/** True once the current order-collection window's 1 PM cutoff has passed. */
export function isOrderWindowClosed(now: Date): boolean {
  return istParts(now).hour >= ORDER_CUTOFF_HOUR && istParts(now).hour < CYCLE_START_HOUR;
}

/**
 * True if two instants fall on the same calendar date in IST —
 * used for "was this updated today," a plain calendar-day check
 * (deliberately separate from the 3PM/1PM price-cycle concept:
 * order quantities are re-entered fresh each calendar day by
 * admin's own account, not carried across a 3PM boundary the way
 * prices are).
 */
export function isSameIstDate(a: Date, b: Date): boolean {
  const pa = istParts(a);
  const pb = istParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

export function formatIstDateTime(instant: Date): string {
  return instant.toLocaleString("en-IN", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatIstDate(instant: Date): string {
  return instant.toLocaleDateString("en-IN", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatIstTime(instant: Date): string {
  return instant.toLocaleTimeString("en-IN", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}