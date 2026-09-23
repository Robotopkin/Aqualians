import type { CategoryId, Kind, Mode } from "./types";

export const CATEGORIES: { id: CategoryId; sector: string; title: string }[] = [
  { id: "nft", sector: "NFT", title: "NFT" },
  { id: "defi", sector: "DeFi", title: "DeFi" },
  { id: "meme", sector: "Meme", title: "Meme" },
  { id: "stablecoin", sector: "Stablecoin", title: "Stablecoin" },
  { id: "ai", sector: "AI", title: "AI" },
  { id: "rwa", sector: "RWA", title: "RWA" },
  { id: "gaming", sector: "Gaming", title: "Gaming" },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryById(id: string) {
  return BY_ID.get(id as CategoryId);
}

export function isCategoryId(id: string): id is CategoryId {
  return BY_ID.has(id as CategoryId);
}

export function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickRoundSetup(roundId: string): { mode: Mode; categories: CategoryId[] } {
  let h = hashString(roundId);
  const rnd = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const modes: Mode[] = ["growth", "movement"];
  const mode = modes[Math.floor(rnd() * modes.length)]!;
  const pool = CATEGORIES.map((c) => c.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const a = pool[i]!;
    const b = pool[j]!;
    pool[i] = b;
    pool[j] = a;
  }
  return { mode, categories: pool.slice(0, 4) };
}

export function pickPlace(roundId: string) {
  return (hashString(`${roundId}:place`) % 4) + 1;
}

export function placeLabel(place: number) {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return "4th";
}

export function roundTitle(kind: Kind) {
  return kind === "volume" ? "Whale Hunt" : "Shrimp Gather";
}

export function roundQuestion(mode: Mode, kind: Kind, place: number) {
  const metric = kind === "volume" ? "volume" : "transaction count";
  const scored = mode === "movement" ? "movement" : "growth";
  return `Which category will take ${placeLabel(place)} place in ${metric} ${scored}?`;
}

export function modeLabel(mode: Mode) {
  return mode === "growth" ? "Growth" : "Movement";
}

const VOLUME_BASE: Record<CategoryId, number> = {
  nft: 2_400_000,
  defi: 18_000_000,
  meme: 6_500_000,
  stablecoin: 42_000_000,
  ai: 4_200_000,
  rwa: 1_100_000,
  gaming: 3_300_000,
};

const TX_BASE: Record<CategoryId, number> = {
  nft: 18_000,
  defi: 92_000,
  meme: 140_000,
  stablecoin: 260_000,
  ai: 41_000,
  rwa: 8_000,
  gaming: 27_000,
};

export function demoReading(category: CategoryId, now: number) {
  const h = hashString(category);
  const t = now / 1000;
  const wave = (speed: number, amp: number, phase: number) => 1 + amp * Math.sin(t / speed + phase);
  return {
    volume: VOLUME_BASE[category] * wave(90, 0.12, h) * wave(240, 0.05, h / 3),
    tx: TX_BASE[category] * wave(70, 0.18, h / 5) * wave(200, 0.04, h / 7),
  };
}
