export function nansenKey() {
  if (process.env.NANSEN_ENABLED === "0") return "";
  return process.env.NANSEN_API_KEY?.trim() || "";
}

export function dailyBudget() {
  const n = Number(process.env.NANSEN_DAILY_CALL_BUDGET ?? 1500);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1500;
}

export function screenerChains() {
  const raw = process.env.NANSEN_CHAINS || "ethereum,base,robinhood";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
}

export function serverPrivateKey() {
  return process.env.SERVER_WALLET_PRIVATE_KEY?.trim() || process.env.SERVER_WALLET_PK?.trim() || "";
}

export const WHALE_VOLUME_USD = 10_000;
export const SHARK_MIN_WIN_RATE = 0.5;
export const DOLPHIN_MIN_DAYS = 14;
export const DAILY_AURA = 100;
export const WHALE_DAILY_AURA = 300;
export const SHRIMP_VEIL_BETS = 10;
