import { categoryById, demoReading } from "./categories";
import { dailyBudget, nansenKey, pollSeconds, screenerChains } from "./config";
import { metaGet, metaSet, one, rows, run } from "./db";
import { utcMidnight } from "./time";
import type { CategoryId, Reading } from "./types";

type CallResult = { ok: boolean; status: number; body: unknown; error: string | null };

export async function nansenPost(endpoint: string, body: unknown): Promise<CallResult> {
  const key = nansenKey();
  if (!key) return { ok: false, status: 0, body: null, error: "no api key" };
  let status = 0;
  let credits: number | null = null;
  try {
    const response = await fetch(`https://api.nansen.ai${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    status = response.status;
    const rawCredits = response.headers.get("x-nansen-credits-used");
    const remaining = response.headers.get("x-nansen-credits-remaining");
    if (rawCredits && Number.isFinite(Number(rawCredits))) credits = Number(rawCredits);
    if (remaining) metaSet("credits_remaining", remaining);
    const json = (await response.json().catch(() => null)) as unknown;
    run(
      "INSERT INTO api_calls(endpoint, status, credits, created_at) VALUES(?, ?, ?, ?)",
      endpoint,
      status,
      credits,
      Date.now(),
    );
    if (!response.ok) {
      const message =
        json && typeof json === "object" && "message" in json ? String((json as { message: unknown }).message) : `HTTP ${status}`;
      metaSet("last_error", message.slice(0, 240));
      return { ok: false, status, body: json, error: message };
    }
    metaSet("last_error", "");
    return { ok: true, status, body: json, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "nansen request failed";
    run(
      "INSERT INTO api_calls(endpoint, status, credits, created_at) VALUES(?, ?, ?, ?)",
      endpoint,
      status,
      credits,
      Date.now(),
    );
    metaSet("last_error", message.slice(0, 240));
    return { ok: false, status, body: null, error: message };
  }
}

export function callsToday(now = Date.now()) {
  const row = one("SELECT COUNT(*) AS n FROM api_calls WHERE created_at >= ?", utcMidnight(now));
  return Number(row?.n ?? 0);
}

export function callsTotal() {
  const row = one("SELECT COUNT(*) AS n FROM api_calls");
  return Number(row?.n ?? 0);
}

export function boardCallsThisTick(now = Date.now()) {
  const budget = dailyBudget();
  const used = callsToday(now);
  const room = budget - used;
  if (room <= 0) return 0;
  const elapsed = Math.max(1, now - utcMidnight(now));
  const expected = (budget * elapsed) / 86_400_000;
  const behind = expected - used;
  if (behind < 0.85) return 0;
  return Math.min(room, 8, Math.max(1, Math.ceil(behind)));
}

export function pollDue(now = Date.now()) {
  const last = Number(metaGet("last_poll_at") ?? 0);
  return now - last >= pollSeconds() * 1000;
}

function num(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export async function fetchSector(category: CategoryId): Promise<Reading | null> {
  const spec = categoryById(category);
  if (!spec) return null;
  const chains = screenerChains();
  const filters: Record<string, unknown> = {
    sectors: [spec.sector],
    include_stablecoins: category === "stablecoin",
    include_native_tokens: false,
    market_cap_usd: { min: category === "meme" ? 25_000 : 50_000 },
    nof_buys: { min: 0 },
  };
  const request = {
    chains,
    timeframe: "1h",
    pagination: { page: 1, per_page: 100 },
    filters,
    order_by: [{ field: "volume", direction: "DESC" }],
  };
  let result = await nansenPost("/api/v1/token-screener", request);
  if (!result.ok && result.status === 422) {
    const { nof_buys: _ignored, ...rest } = filters;
    result = await nansenPost("/api/v1/token-screener", { ...request, filters: rest });
  }
  if (!result.ok || !result.body || typeof result.body !== "object") return null;
  const data = (result.body as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  let volume = 0;
  let tx = 0;
  let sawTrades = false;
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const token = row as Record<string, unknown>;
    volume += num(token.volume);
    const buys = token.nof_buys;
    const sells = token.nof_sells;
    if (typeof buys === "number" || typeof sells === "number") {
      sawTrades = true;
      tx += num(buys) + num(sells);
    } else if (!sawTrades) {
      tx += num(token.nof_traders);
    }
  }
  return { volume, tx };
}

export function writeCache(category: CategoryId, reading: Reading, source: string, now: number) {
  run(
    `INSERT INTO sector_cache(category, volume, tx, updated_at, source)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(category) DO UPDATE SET
       volume = excluded.volume,
       tx = excluded.tx,
       updated_at = excluded.updated_at,
       source = excluded.source`,
    category,
    reading.volume,
    reading.tx,
    now,
    source,
  );
}

export function cachedReadings() {
  return rows("SELECT category, volume, tx, updated_at, source FROM sector_cache").map((row) => ({
    category: String(row.category),
    volume: Number(row.volume),
    tx: Number(row.tx),
    updatedAt: Number(row.updated_at),
    source: String(row.source),
  }));
}

export function demoFill(categories: CategoryId[], now: number) {
  for (const category of categories) writeCache(category, demoReading(category, now), "demo", now);
}

export function nansenStatus(now = Date.now()) {
  return {
    live: Boolean(nansenKey()),
    callsTotal: callsTotal(),
    callsToday: callsToday(now),
    budget: dailyBudget(),
    lastError: metaGet("last_error") || null,
    creditsRemaining: metaGet("credits_remaining"),
    updatedAt: Number(metaGet("last_poll_at") || 0) || null,
  };
}
