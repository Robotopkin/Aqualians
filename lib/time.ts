const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function roundSpan() {
  const raw = process.env.AURASEA_ROUND_MS;
  if (raw === "0") return DAY;
  const n = Number(raw ?? 5 * 60 * 1000);
  if (!Number.isFinite(n) || n < 60_000) return 5 * 60 * 1000;
  return Math.floor(n);
}

export function utcMidnight(now: number) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function utcDayKey(now: number) {
  return new Date(utcMidnight(now)).toISOString().slice(0, 10);
}

export function grantKey(now: number) {
  return utcDayKey(now);
}

export type Window = { start: number; betsClose: number; end: number };

export function activeVolumeWindow(now: number): Window {
  const span = roundSpan();
  const start = Math.floor(now / span) * span;
  return { start, betsClose: start + span / 2, end: start + span };
}

export function activeTxWindow(now: number): Window {
  const span = roundSpan();
  const half = span / 2;
  const start = Math.floor((now - half) / span) * span + half;
  return { start, betsClose: start + half, end: start + span };
}

export function phaseOf(now: number, window: Window): "betting" | "forming" {
  return now < window.betsClose ? "betting" : "forming";
}
