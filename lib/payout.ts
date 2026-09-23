import { rankCategories } from "./score";
import type { Mode, Role, StoredBet } from "./types";

export type Payout = { userId: number; stakeBack: number; profit: number; referrerId: number | null };
export type ReferralPay = { userId: number; amount: number; fromUserId: number };

export type Settlement = {
  refund: boolean;
  reason: string | null;
  ranks: { category: string; change: number; rank: number }[];
  payouts: Payout[];
  referrals: ReferralPay[];
};

function weightOf(role: Role, amount: number) {
  return role === "shark" ? amount * 105 : amount * 100;
}

export function settle(input: {
  mode: Mode;
  changes: { category: string; change: number }[];
  bets: StoredBet[];
}): Settlement {
  const ranks = rankCategories(input.mode, input.changes);
  const rankOf = new Map(ranks.map((row) => [row.category, row.rank]));
  const winning = input.bets.filter((bet) => rankOf.get(bet.category) === bet.rank);
  const winningIds = new Set(winning.map((bet) => bet.id));
  const loserPool = input.bets
    .filter((bet) => !winningIds.has(bet.id))
    .reduce((sum, bet) => sum + bet.amount, 0);

  if (input.bets.length > 0 && winning.length === 0) {
    const payouts = group(
      input.bets.map((bet) => ({
        userId: bet.userId,
        stakeBack: bet.amount,
        profit: 0,
        referrerId: bet.referrerId,
      })),
    );
    return { refund: true, reason: "nobody hit the outcome", ranks, payouts, referrals: [] };
  }

  const totalWeight = winning.reduce((sum, bet) => sum + weightOf(bet.role, bet.amount), 0);
  const shares = winning.map((bet) => {
    const weight = weightOf(bet.role, bet.amount);
    const profit = totalWeight > 0 ? Math.floor((loserPool * weight) / totalWeight) : 0;
    return { bet, weight, profit };
  });
  let dust = loserPool - shares.reduce((sum, row) => sum + row.profit, 0);
  shares.sort((a, b) => b.weight - a.weight || a.bet.userId - b.bet.userId || a.bet.id - b.bet.id);
  let i = 0;
  while (dust > 0 && shares.length > 0) {
    shares[i % shares.length]!.profit += 1;
    dust -= 1;
    i += 1;
  }

  const payouts = group(
    shares.map((row) => ({
      userId: row.bet.userId,
      stakeBack: row.bet.amount,
      profit: row.profit,
      referrerId: row.bet.referrerId,
    })),
  );

  const referrals: ReferralPay[] = [];
  for (const payout of payouts) {
    if (!payout.referrerId || payout.profit <= 0 || payout.referrerId === payout.userId) continue;
    const amount = Math.floor((payout.profit * 10) / 100);
    if (amount > 0) referrals.push({ userId: payout.referrerId, amount, fromUserId: payout.userId });
  }

  return { refund: false, reason: null, ranks, payouts, referrals };
}

function group(rows: Payout[]): Payout[] {
  const map = new Map<number, Payout>();
  for (const row of rows) {
    const prev = map.get(row.userId);
    if (!prev) {
      map.set(row.userId, { ...row });
      continue;
    }
    prev.stakeBack += row.stakeBack;
    prev.profit += row.profit;
    prev.referrerId = prev.referrerId ?? row.referrerId;
  }
  return [...map.values()];
}
