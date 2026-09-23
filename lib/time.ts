const HOUR = 60 * 60 * 1000;

export function utcMidnight(now: number) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function utcDayKey(now: number) {
  return new Date(utcMidnight(now)).toISOString().slice(0, 10);
}

export type Window = { start: number; betsClose: number; end: number };

export function activeVolumeWindow(now: number): Window {
  const start = utcMidnight(now);
  return { start, betsClose: start + 12 * HOUR, end: start + 24 * HOUR };
}

export function activeTxWindow(now: number): Window {
  const mid = utcMidnight(now) + 12 * HOUR;
  const start = now >= mid ? mid : mid - 24 * HOUR;
  return { start, betsClose: start + 12 * HOUR, end: start + 24 * HOUR };
}

export function phaseOf(now: number, window: Window): "betting" | "forming" {
  return now < window.betsClose ? "betting" : "forming";
}
