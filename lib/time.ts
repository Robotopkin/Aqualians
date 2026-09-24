const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PRODUCTION_LAUNCH_AT = Date.UTC(2026, 8, 25);

export function roundSpan() {
  if (process.env.VERCEL) return DAY;
  const raw = process.env.AURASEA_ROUND_MS;
  if (raw === "0") return DAY;
  if (raw == null || raw.trim() === "") return DAY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return DAY;
  return Math.floor(n);
}

export function launchAt() {
  const raw = process.env.AURASEA_LAUNCH_AT?.trim();
  if (!raw) return process.env.VERCEL ? PRODUCTION_LAUNCH_AT : 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.floor(numeric);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function launchSchedule() {
  const volume = launchAt();
  return { volume, tx: volume > 0 ? volume + DAY / 2 : 0 };
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
