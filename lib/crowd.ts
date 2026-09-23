import type { CategoryId, Role } from "./types";

export type TideBet = {
  role: Role;
  category: CategoryId;
  amount: number;
  userId: number;
};

export function shrimpTide(bets: TideBet[], categories: CategoryId[]) {
  const shrimp = bets.filter((bet) => bet.role === "shrimp");
  const veiled = shrimp.length < 10;
  if (veiled) {
    return {
      veiled: true,
      bets: shrimp.length,
      shares: Object.fromEntries(categories.map((id) => [id, 0.25])) as Record<string, number>,
    };
  }
  const totals = Object.fromEntries(categories.map((id) => [id, 0])) as Record<string, number>;
  for (const bet of shrimp) {
    if (totals[bet.category] == null) continue;
    totals[bet.category] = (totals[bet.category] ?? 0) + bet.amount;
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  const shares =
    sum <= 0
      ? (Object.fromEntries(categories.map((id) => [id, 0.25])) as Record<string, number>)
      : (Object.fromEntries(categories.map((id) => [id, (totals[id] ?? 0) / sum])) as Record<string, number>);
  return { veiled: false, bets: shrimp.length, shares };
}

export function whaleSpotlight(bets: TideBet[], categories: CategoryId[]): CategoryId | null {
  const rows = new Map<CategoryId, { aura: number; whales: Set<number> }>();
  for (const id of categories) rows.set(id, { aura: 0, whales: new Set() });
  for (const bet of bets) {
    if (bet.role !== "whale") continue;
    const row = rows.get(bet.category);
    if (!row || bet.amount <= 0) continue;
    row.aura += bet.amount;
    row.whales.add(bet.userId);
  }
  let best: { id: CategoryId; aura: number; unique: number } | null = null;
  for (const id of categories) {
    const row = rows.get(id);
    if (!row || row.aura <= 0) continue;
    const unique = row.whales.size;
    if (
      !best ||
      row.aura > best.aura ||
      (row.aura === best.aura && unique > best.unique)
    ) {
      best = { id, aura: row.aura, unique };
    }
  }
  return best?.id ?? null;
}
