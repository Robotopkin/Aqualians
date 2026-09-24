import assert from "node:assert/strict";
import { shrimpTide, whaleSpotlight } from "../lib/crowd.ts";
import { settle } from "../lib/payout.ts";
import { normalizeWinRate, roleFromStats } from "../lib/roles.ts";
import { CATEGORIES, simulatedPair } from "../lib/categories.ts";
import { rankCategories, relativeChange } from "../lib/score.ts";
import { activeTxWindow, activeVolumeWindow } from "../lib/time.ts";
import type { StoredBet } from "../lib/types.ts";

function bet(partial: Partial<StoredBet> & Pick<StoredBet, "id" | "userId" | "amount" | "category" | "rank">): StoredBet {
  return {
    role: "shrimp",
    referrerId: null,
    ...partial,
  };
}

process.env.AURASEA_ROUND_MS = "0";
const noon = Date.UTC(2026, 8, 23, 15, 0, 0);
const volume = activeVolumeWindow(noon);
assert.equal(volume.start, Date.UTC(2026, 8, 23));
assert.equal(volume.betsClose, Date.UTC(2026, 8, 23, 12));
assert.equal(volume.end, Date.UTC(2026, 8, 24));

const morning = Date.UTC(2026, 8, 23, 3, 0, 0);
const tx = activeTxWindow(morning);
assert.equal(tx.start, Date.UTC(2026, 8, 22, 12));
assert.equal(tx.betsClose, Date.UTC(2026, 8, 23));
assert.equal(tx.end, Date.UTC(2026, 8, 23, 12));

process.env.AURASEA_ROUND_MS = "300000";
const fast = activeVolumeWindow(noon);
assert.equal(fast.end - fast.start, 300_000);
assert.equal(fast.betsClose - fast.start, 150_000);
assert.ok(fast.start <= noon && noon < fast.end);
const fastTx = activeTxWindow(noon);
assert.equal(fastTx.end - fastTx.start, 300_000);
assert.equal(fastTx.start % 300_000, 150_000);
process.env.AURASEA_ROUND_MS = "0";

const simStart = Date.UTC(2026, 8, 24, 8, 0, 0);
const simChanges = CATEGORIES.map((row) => {
  const pair = simulatedPair(row.id, simStart);
  return { category: row.id, change: (pair.close.volume - pair.open.volume) / pair.open.volume };
});
const simRanks = rankCategories("movement", simChanges);
assert.equal(new Set(simRanks.map((row) => row.rank)).size, CATEGORIES.length);

assert.equal(relativeChange(100, 110), 0.1);
assert.equal(relativeChange(0, 5), 1);

const growth = rankCategories("growth", [
  { category: "meme", change: 0.2 },
  { category: "defi", change: 0.5 },
  { category: "nft", change: 0.5 },
  { category: "ai", change: -0.1 },
]);
assert.deepEqual(
  growth.map((row) => [row.category, row.rank]),
  [
    ["defi", 1],
    ["nft", 1],
    ["meme", 2],
    ["ai", 3],
  ],
);

const fallen = rankCategories("growth", [
  { category: "meme", change: -0.2 },
  { category: "defi", change: -0.5 },
  { category: "nft", change: -0.1 },
]);
assert.deepEqual(
  fallen.map((row) => [row.category, row.rank]),
  [
    ["nft", 1],
    ["meme", 2],
    ["defi", 3],
  ],
);

const shark = settle({
  mode: "growth",
  changes: [
    { category: "defi", change: 0.4 },
    { category: "meme", change: 0.1 },
  ],
  bets: [
    bet({ id: 1, userId: 1, role: "shark", category: "defi", rank: 1, amount: 100, referrerId: 9 }),
    bet({ id: 2, userId: 2, category: "defi", rank: 1, amount: 50 }),
    bet({ id: 3, userId: 3, category: "meme", rank: 1, amount: 100 }),
  ],
});
assert.equal(shark.refund, false);
const sharkPay = shark.payouts.find((row) => row.userId === 1);
const otherPay = shark.payouts.find((row) => row.userId === 2);
assert.ok(sharkPay && otherPay);
assert.equal(sharkPay.stakeBack, 100);
assert.equal(otherPay.stakeBack, 50);
assert.equal(sharkPay.stakeBack + sharkPay.profit + otherPay.stakeBack + otherPay.profit, 250);
assert.equal(sharkPay.profit + otherPay.profit, 100);
assert.ok(sharkPay.profit > otherPay.profit);
assert.equal(shark.referrals[0]?.userId, 9);
assert.equal(shark.referrals[0]?.amount, Math.floor((sharkPay.profit * 10) / 100));

const miss = settle({
  mode: "movement",
  changes: [{ category: "nft", change: 0.01 }],
  bets: [bet({ id: 1, userId: 4, category: "nft", rank: 2, amount: 15 })],
});
assert.equal(miss.refund, true);
assert.equal(miss.payouts[0]?.stakeBack, 15);
assert.equal(miss.payouts[0]?.profit, 0);
assert.equal(miss.referrals.length, 0);

const tide = shrimpTide(
  [
    { role: "shrimp", category: "nft", amount: 10, userId: 1 },
    { role: "whale", category: "defi", amount: 90, userId: 2 },
  ],
  ["nft", "defi", "meme", "ai"],
);
assert.equal(tide.veiled, true);
assert.equal(tide.shares.nft, 0.25);

const live = shrimpTide(
  Array.from({ length: 10 }, (_, i) => ({
    role: "shrimp" as const,
    category: (i < 7 ? "nft" : "defi") as "nft" | "defi",
    amount: 10,
    userId: i + 1,
  })),
  ["nft", "defi"],
);
assert.equal(live.veiled, false);
assert.ok(Math.abs((live.shares.nft ?? 0) - 0.7) < 1e-9);

const spot = whaleSpotlight(
  [
    { role: "whale", category: "meme", amount: 40, userId: 1 },
    { role: "whale", category: "meme", amount: 10, userId: 1 },
    { role: "whale", category: "ai", amount: 50, userId: 2 },
    { role: "whale", category: "ai", amount: 0, userId: 3 },
    { role: "shrimp", category: "nft", amount: 500, userId: 4 },
  ],
  ["meme", "ai", "nft"],
);
assert.equal(spot, "meme");

const tie = whaleSpotlight(
  [
    { role: "whale", category: "meme", amount: 20, userId: 1 },
    { role: "whale", category: "ai", amount: 10, userId: 2 },
    { role: "whale", category: "ai", amount: 10, userId: 3 },
  ],
  ["meme", "ai"],
);
assert.equal(tie, "ai");

assert.equal(roleFromStats({ volumeUsd: 10_000, tradedTimes: 1, winRate: 0, activeDays: 0 }), "whale");
assert.equal(roleFromStats({ volumeUsd: 9_999, tradedTimes: 1, winRate: 0, activeDays: 30 }), "dolphin");
assert.equal(roleFromStats({ volumeUsd: 0, tradedTimes: 5, winRate: 0.5, activeDays: 0 }), "shark");
assert.equal(roleFromStats({ volumeUsd: 0, tradedTimes: 5, winRate: 0.4, activeDays: 0 }), "shrimp");
assert.equal(roleFromStats({ volumeUsd: 0, tradedTimes: 5, winRate: 0.49, activeDays: 14 }), "dolphin");
assert.equal(roleFromStats({ volumeUsd: 0, tradedTimes: 5, winRate: 0.39, activeDays: 14 }), "dolphin");
assert.equal(roleFromStats({ volumeUsd: 50_000, tradedTimes: 0, winRate: null, activeDays: 0 }), "whale");
assert.equal(roleFromStats({ volumeUsd: 0, tradedTimes: 0, winRate: 1, activeDays: 0 }), "shark");
assert.equal(roleFromStats({ volumeUsd: 0, tradedTimes: 99, winRate: 0.39, activeDays: 13 }), "shrimp");

assert.equal(normalizeWinRate(0.4, 5), 0.4);
assert.equal(normalizeWinRate(2, 5), 0.4);
assert.equal(normalizeWinRate(40, 5), 0.4);

console.log("aurasea tests ok");
