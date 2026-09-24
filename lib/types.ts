export type Role = "shrimp" | "dolphin" | "shark" | "whale";
export type Mode = "growth" | "movement";
export type Kind = "volume" | "tx";
export type Phase = "betting" | "forming";

export type CategoryId =
  | "nft"
  | "defi"
  | "meme"
  | "stablecoin"
  | "ai"
  | "rwa"
  | "gaming";

export type RoleEvidence = {
  chain: string;
  balanceUsd: number | null;
  tradedTimes: number | null;
  winRate: number | null;
  volumeUsd: number | null;
  activeDays: number | null;
  publicFigureChecked: false;
  note: string;
  xFollowers?: number | null;
};

export type Reading = { volume: number; tx: number };

export type Yesterday = { changePct: number; rank: number };

export type PublicCategory = {
  id: CategoryId;
  title: string;
  changePct: number | null;
  rank: number | null;
  whale: boolean;
  yesterday: Yesterday | null;
  shrimpShare: number | null;
};

export type PublicBet = { category: CategoryId; rank: number; amount: number };

export type PublicRound = {
  id: string;
  kind: Kind;
  title: string;
  question: string;
  mode: Mode;
  place: number;
  phase: Phase;
  startsAt: number;
  betsCloseAt: number;
  endsAt: number;
  late: boolean;
  poolTotal: number;
  categories: PublicCategory[];
  myBets: PublicBet[];
  shrimpVeil: { veiled: boolean; bets: number } | null;
  betCount: number;
};

export type PublicReceipt = {
  amount: number;
  reason: string;
  signature: string;
  createdAt: string;
};

export type PublicViewer = {
  address: string;
  xHandle: string;
  role: Role;
  aura: number;
  referralCode: string;
  evidence: RoleEvidence;
  receipts: PublicReceipt[];
};

export type TideResult = {
  roundId: string;
  title: string;
  question: string;
  startsAt: number;
  status: "open" | "won" | "lost" | "returned";
  stake: number;
  pool: number;
  profit: number;
  lost: number;
  picks: {
    category: string;
    title: string;
    amount: number;
    won: boolean | null;
    rank: number | null;
    changePct: number | null;
  }[];
};

export type ReferralRow = {
  xHandle: string;
  role: Role;
  earned: number;
  joinedAt: string;
};

export type LeaderboardRow = {
  rank: number;
  xHandle: string;
  role: Role;
  aura: number;
  viewer: boolean;
};

export type LeaderboardBoard = {
  refreshedAt: number;
  currentRank: number;
  rows: LeaderboardRow[];
};

export type PublicState = {
  now: number;
  serverAddress: string;
  nansen: {
    live: boolean;
    callsTotal: number;
    callsToday: number;
    budget: number;
    lastError: string | null;
    creditsRemaining: string | null;
    updatedAt: number | null;
  };
  viewer: PublicViewer | null;
  referralRequired: boolean;
  grant: { amount: number; day: string } | null;
  rounds: PublicRound[];
};

export type BetLine = { category: CategoryId; rank: number; amount: number };

export type StoredBet = BetLine & {
  id: number;
  userId: number;
  role: Role;
  referrerId: number | null;
};
