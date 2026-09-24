import {
  DOLPHIN_MIN_DAYS,
  SHARK_MIN_WIN_RATE,
  WHALE_VOLUME_USD,
} from "./config";
import { nansenPost } from "./nansen";
import type { Role, RoleEvidence } from "./types";

function num(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function normalizeWinRate(winRate: number | null, tradedTimes: number) {
  if (winRate == null) return null;
  if (tradedTimes > 0 && winRate > 1 && winRate <= tradedTimes) return winRate / tradedTimes;
  if (winRate > 1 && winRate <= 100) return winRate / 100;
  if (winRate >= 0 && winRate <= 1) return winRate;
  return null;
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function roleFromStats(stats: {
  volumeUsd: number;
  tradedTimes: number;
  winRate: number | null;
  activeDays: number;
}): Role {
  if (stats.volumeUsd >= WHALE_VOLUME_USD) return "whale";
  if ((stats.winRate ?? 0) >= SHARK_MIN_WIN_RATE) return "shark";
  if (stats.activeDays >= DOLPHIN_MIN_DAYS) return "dolphin";
  return "shrimp";
}

export async function classifyWallet(address: string): Promise<{ role: Role; evidence: RoleEvidence }> {
  const evidence: RoleEvidence = {
    chain: "all",
    balanceUsd: null,
    tradedTimes: 0,
    winRate: null,
    volumeUsd: 0,
    activeDays: 0,
    publicFigureChecked: false,
    note: "Public Figure is not checked. Premium labels cost 500 credits.",
  };

  let volume = 0;
  const pnl = await nansenPost("/api/v1/profiler/address/pnl", {
    address,
    chain: "all",
    date: { from: isoDaysAgo(90), to: new Date().toISOString() },
    pagination: { page: 1, per_page: 1000 },
  });
  const pnlData = pnl.ok && pnl.body && typeof pnl.body === "object" ? (pnl.body as { data?: unknown }).data : null;
  if (Array.isArray(pnlData)) {
    for (const row of pnlData) {
      if (!row || typeof row !== "object") continue;
      const token = row as { bought_usd?: unknown; sold_usd?: unknown };
      volume += (num(token.bought_usd) ?? 0) + (num(token.sold_usd) ?? 0);
    }
  }
  evidence.volumeUsd = roundUsd(volume);
  if (volume >= WHALE_VOLUME_USD) return { role: "whale", evidence };

  const summary = await nansenPost("/api/v1/profiler/address/pnl-summary", {
    address,
    chain: "all",
    date: { from: isoDaysAgo(90), to: new Date().toISOString() },
  });
  let trades = 0;
  if (summary.ok && summary.body && typeof summary.body === "object") {
    const body = summary.body as { traded_times?: unknown; win_rate?: unknown };
    trades = num(body.traded_times) ?? 0;
    evidence.winRate = normalizeWinRate(num(body.win_rate), trades);
  }
  evidence.tradedTimes = trades;
  if ((evidence.winRate ?? 0) >= SHARK_MIN_WIN_RATE) return { role: "shark", evidence };

  const days = new Set<string>();
  const activity = await nansenPost("/api/v1/profiler/address/transactions", {
    address,
    chain: "all",
    date: { from: isoDaysAgo(30), to: new Date().toISOString() },
    hide_spam_token: true,
    pagination: { page: 1, per_page: 100 },
  });
  const activityBody =
    activity.ok && activity.body && typeof activity.body === "object"
      ? (activity.body as { data?: unknown })
      : null;
  const activityData = activityBody && Array.isArray(activityBody.data) ? activityBody.data : [];
  for (const row of activityData) {
    if (!row || typeof row !== "object") continue;
    const stamp = (row as { block_timestamp?: unknown }).block_timestamp;
    if (typeof stamp === "string" && stamp.length >= 10) days.add(stamp.slice(0, 10));
  }
  evidence.activeDays = days.size;
  return {
    role: roleFromStats({
      volumeUsd: volume,
      tradedTimes: trades,
      winRate: evidence.winRate,
      activeDays: days.size,
    }),
    evidence,
  };
}

function roundUsd(n: number) {
  return Math.round(n * 100) / 100;
}
