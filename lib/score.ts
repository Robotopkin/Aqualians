import type { Mode } from "./types";

export function relativeChange(baseline: number, current: number) {
  if (!(baseline > 0)) return current > 0 ? 1 : 0;
  return (current - baseline) / baseline;
}

export function quantize(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

export function metricScore(mode: Mode, change: number) {
  if (mode === "movement") return Math.abs(change);
  return change;
}

export type Ranked = { category: string; change: number; rank: number };

export function rankCategories(mode: Mode, changes: { category: string; change: number }[]): Ranked[] {
  const sorted = changes
    .map((row) => ({ ...row, score: quantize(metricScore(mode, row.change)) }))
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((row) => {
    if (prev === null || row.score !== prev) rank += 1;
    prev = row.score;
    return { category: row.category, change: row.change, rank };
  });
}
