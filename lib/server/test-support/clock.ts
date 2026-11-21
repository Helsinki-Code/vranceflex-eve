import { vi } from "vitest";

/**
 * Tuesday 2030-01-15, 14:00 UTC: mid-morning in New York and mid-afternoon in
 * London, inside the default sending window for both. DB-backed delivery tests
 * pin the clock here so they do not depend on when they happen to run. It is
 * later than any real "now", so rows stamped with the database's own now()
 * still count as already due.
 */
export const BUSINESS_HOURS = new Date("2030-01-15T14:00:00Z");

/** Freezes Date only (timers keep running, so database I/O is unaffected). */
export function pinClock(at: Date = BUSINESS_HOURS) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}

export function unpinClock() {
  vi.useRealTimers();
}
