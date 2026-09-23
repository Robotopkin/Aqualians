import {
  DOLPHIN_MIN_DAYS,
  profileChains,
  ROLE_CALL_CAP,
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
  const chains = profileChains();
  const evidence: RoleEvidence = {
    chain: chains.join(","),
    balanceUsd: null,
    tradedTimes: 0,
    winRate: null,
    volumeUsd: 0,
    activeDays: 0,
    publicFigureChecked: false,
    note: "Public Figure is not checked. Premium labels cost 500 credits.",
  };
  let spent = 0;
  const can = () => spent < ROLE_CALL_CAP;

  let volume = 0;
  for (const chain of chains) {
    if (!can()) break;
    spent += 1;
    const pnl = await nansenPost("/api/v1/profiler/address/pnl", {
      address,
      chain,
      date: { from: isoDaysAgo(90), to: new Date().toISOString() },
      pagination: { page: 1, per_page: 100 },
    });
    const data = pnl.ok && pnl.body && typeof pnl.body === "object" ? (pnl.body as { data?: unknown }).data : null;
    if (Array.isArray(data)) {
      for (const row of data) {
        if (!row || typeof row !== "object") continue;
        const token = row as { bought_usd?: unknown; sold_usd?: unknown };
        volume += (num(token.bought_usd) ?? 0) + (num(token.sold_usd) ?? 0);
      }
    }
    if (volume >= WHALE_VOLUME_USD) break;
  }
  evidence.volumeUsd = roundUsd(volume);
  if (volume >= WHALE_VOLUME_USD) return { role: "whale", evidence };

  let trades = 0;
  let winWeighted = 0;
  let winSamples = 0;
  for (const chain of chains) {
    if (!can()) break;
    spent += 1;
    const summary = await nansenPost("/api/v1/profiler/address/pnl-summary", {
      address,
      chain,
      date: { from: isoDaysAgo(90), to: new Date().toISOString() },
    });
    if (summary.ok && summary.body && typeof summary.body === "object") {
      const body = summary.body as { traded_times?: unknown; win_rate?: unknown };
      const times = num(body.traded_times) ?? 0;
      const rate = normalizeWinRate(num(body.win_rate), times);
      trades += times;
      if (rate != null && times > 0) {
        winWeighted += rate * times;
        winSamples += times;
      }
    }
  }
  evidence.tradedTimes = trades;
  evidence.volumeUsd = roundUsd(volume);
  evidence.winRate = winSamples > 0 ? winWeighted / winSamples : null;
  const beforeDays = roleFromStats({
    volumeUsd: volume,
    tradedTimes: trades,
    winRate: evidence.winRate,
    activeDays: 0,
  });
  if (beforeDays === "whale" || beforeDays === "shark") return { role: beforeDays, evidence };

  const days = new Set<string>();
  const chain = chains[0] ?? "ethereum";
  for (let page = 1; page <= 2; page++) {
    if (!can()) break;
    spent += 1;
    const result = await nansenPost("/api/v1/profiler/address/transactions", {
      address,
      chain,
      date: { from: isoDaysAgo(30), to: new Date().toISOString() },
      hide_spam_token: true,
      pagination: { page, per_page: 100 },
    });
    const body = result.ok && result.body && typeof result.body === "object" ? (result.body as { data?: unknown; pagination?: { is_last_page?: boolean } }) : null;
    const data = body && Array.isArray(body.data) ? body.data : [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const stamp = (row as { block_timestamp?: unknown }).block_timestamp;
      if (typeof stamp === "string" && stamp.length >= 10) days.add(stamp.slice(0, 10));
    }
    if (days.size >= DOLPHIN_MIN_DAYS) break;
    if (!body || body.pagination?.is_last_page !== false) break;
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
