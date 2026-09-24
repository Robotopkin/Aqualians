import { randomBytes } from "crypto";
import { verifyMessage } from "viem";
import { categoryById, demoReading, isCategoryId, pickPlace, pickRoundSetup, roundQuestion, roundTitle, simulatedPair } from "./categories";
import {
  DAILY_AURA,
  nansenKey,
  WHALE_DAILY_AURA,
} from "./config";
import { shrimpTide, whaleSpotlight } from "./crowd";
import { metaGet, metaSet, one, rows, run } from "./db";
import { withLock } from "./lock";
import { betMessage, checksum, loginMessage, normalizeHandle, registerMessage, validHandle } from "./messages";
import { cachedReadings, demoFill, fetchSector, nansenStatus, writeCache } from "./nansen";
import { settle } from "./payout";
import { classifyWallet } from "./roles";
import { rankCategories, relativeChange } from "./score";
import { ensureServerAccount, serverAccount, signReceipt } from "./server-wallet";
import { activeTxWindow, activeVolumeWindow, grantKey, phaseOf, roundSpan } from "./time";
import type { BetLine, CategoryId, Kind, LeaderboardBoard, Mode, PublicState, Reading, ReferralRow, Role, RoleEvidence, StoredBet, TideResult } from "./types";

type RoundRow = {
  id: string;
  kind: Kind;
  mode: Mode | "stability";
  categories: string;
  starts_at: number;
  bets_close_at: number;
  ends_at: number;
  status: string;
  baseline_json: string | null;
  latest_json: string | null;
  baseline_at: number | null;
  latest_at: number | null;
  reading_source: string | null;
  result_json: string | null;
  place: number | null;
};

const globalForBoot = globalThis as unknown as {
  auraseaBoot?: boolean;
  auraseaTimer?: NodeJS.Timeout;
  auraseaReady?: Promise<void>;
};

export function boot() {
  if (globalForBoot.auraseaBoot) return globalForBoot.auraseaReady ?? Promise.resolve();
  globalForBoot.auraseaBoot = true;
  if (process.env.VERCEL) {
    globalForBoot.auraseaReady = Promise.resolve();
    return globalForBoot.auraseaReady;
  }
  const ready = ensureServerAccount().then(() => runTick());
  globalForBoot.auraseaReady = ready;
  globalForBoot.auraseaTimer = setInterval(() => void runTick(), 20_000);
  return ready;
}

export function runTick() {
  return withLock(() => tick());
}

async function closeStaleRounds(now: number) {
  const span = roundSpan();
  const volume = activeVolumeWindow(now);
  const tx = activeTxWindow(now);
  const keep = new Set([`volume:${new Date(volume.start).toISOString()}`, `tx:${new Date(tx.start).toISOString()}`]);
  const open = (await rows("SELECT * FROM rounds WHERE status = 'open'")) as unknown as RoundRow[];
  for (const round of open) {
    if (keep.has(round.id) || round.ends_at <= now) continue;
    if (round.ends_at - round.starts_at === span) continue;
    const claimed = await run(
      "UPDATE rounds SET status = 'settling', result_json = ? WHERE id = ? AND status = 'open'",
      JSON.stringify({ refund: true, reason: "clock changed" }),
      round.id,
    );
    if (!claimed.changes) continue;
    const bets = await loadBets(round.id);
    await payRefunds(round, bets, "the tide clock changed");
    await run(
      "UPDATE rounds SET status = 'settled', result_json = ? WHERE id = ?",
      JSON.stringify({ refund: true, reason: "clock changed" }),
      round.id,
    );
  }
}

let tideJob: Promise<void> | null = null;

function scheduleTide(now: number, open: RoundRow[]) {
  const due = open.length < 2 || open.some((round) => !round.baseline_json || round.ends_at <= now);
  if (!due || tideJob) return;
  tideJob = runTick()
    .catch((err: unknown) => console.error("tide", err instanceof Error ? err.message : err))
    .finally(() => {
      tideJob = null;
    });
}

export function pendingTide() {
  return tideJob;
}

async function tick() {
  const now = Date.now();
  await rollPlaces();
  await collapseDuplicateCredits();
  await closeStaleRounds(now);
  await ensureRound("volume", activeVolumeWindow(now));
  await ensureRound("tx", activeTxWindow(now));
  await refreshReadings(now);
  const ended = (await rows("SELECT * FROM rounds WHERE status = 'open' AND ends_at <= ?", now)) as unknown as RoundRow[];
  const settling = (await rows("SELECT * FROM rounds WHERE status = 'settling'")) as unknown as RoundRow[];
  const due = [...ended, ...settling.filter((round) => !ended.some((open) => open.id === round.id))];
  for (const round of due) await settleRound(round, now);
}

async function ensureRound(kind: Kind, window: { start: number; betsClose: number; end: number }) {
  const id = `${kind}:${new Date(window.start).toISOString()}`;
  const existing = await one("SELECT id FROM rounds WHERE id = ?", id);
  if (existing) return;
  const setup = pickRoundSetup(id);
  const place = pickPlace(id);
  await run(
    `INSERT INTO rounds(id, kind, mode, categories, starts_at, bets_close_at, ends_at, status, place)
     VALUES(?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    id,
    kind,
    setup.mode,
    JSON.stringify(setup.categories),
    window.start,
    window.betsClose,
    window.end,
    place,
  );
}

async function askedPlace(round: RoundRow) {
  if (round.mode === "stability") {
    await run("UPDATE rounds SET mode = 'movement', place = 4 WHERE id = ?", round.id);
    round.mode = "movement";
    round.place = 4;
    return 4;
  }
  if (round.place != null && round.place >= 1 && round.place <= 4) return round.place;
  const place = pickPlace(round.id);
  await run("UPDATE rounds SET place = ? WHERE id = ?", place, round.id);
  round.place = place;
  return place;
}

async function rollPlaces() {
  if (await metaGet("place_roll_v2")) return;
  const open = await rows("SELECT id, mode FROM rounds WHERE status = 'open'") as { id: string; mode: string }[];
  for (const round of open) {
    if (round.mode === "stability") {
      await run("UPDATE rounds SET mode = 'movement', place = 4 WHERE id = ?", round.id);
    } else if (round.mode === "movement") {
      await run("UPDATE rounds SET place = ? WHERE id = ?", pickPlace(String(round.id)), String(round.id));
    }
  }
  await metaSet("place_roll_v2", "1");
}

async function refreshReadings(now: number) {
  const open = await rows("SELECT * FROM rounds WHERE status = 'open'") as unknown as RoundRow[];
  const due = open.filter((round) => !round.baseline_json || round.ends_at <= now);
  if (!due.length) return;
  const needed = new Set<CategoryId>();
  for (const round of due) {
    for (const id of JSON.parse(round.categories) as CategoryId[]) needed.add(id);
  }
  const categoriesDue = [...needed];
  if (!categoriesDue.length) return;

  if (roundSpan() < 24 * 60 * 60 * 1000 || !nansenKey()) {
    if (roundSpan() < 24 * 60 * 60 * 1000) await applySimulated(due, now);
    else {
      await demoFill(categoriesDue, now);
      await metaSet("last_poll_at", String(now));
      await applyCache(due, "demo", now);
    }
    return;
  }

  await Promise.all(
    categoriesDue.map(async (category) => {
      const reading = await fetchSector(category);
      if (reading) await writeCache(category, reading, "live", now);
    }),
  );
  await metaSet("last_poll_at", String(now));
  await applyCache(due, "live", now);
}

async function applySimulated(open: RoundRow[], now: number) {
  for (const round of open) {
    const categories = JSON.parse(round.categories) as CategoryId[];
    const reset = round.reading_source !== "demo";
    const baseline = reset ? {} : parseReadings(round.baseline_json);
    const latest = reset ? {} : parseReadings(round.latest_json);
    let touched = reset;
    for (const category of categories) {
      const pair = simulatedPair(category, round.starts_at);
      if (!baseline[category]) {
        baseline[category] = pair.open;
        touched = true;
      }
      const next = round.ends_at <= now ? pair.close : baseline[category]!;
      const prev = latest[category];
      if (!prev || prev.volume !== next.volume || prev.tx !== next.tx) {
        latest[category] = next;
        touched = true;
      }
    }
    if (!touched) continue;
    const baselineAt = reset || !round.baseline_at ? round.starts_at : round.baseline_at;
    await run(
      `UPDATE rounds
       SET baseline_json = ?, latest_json = ?, baseline_at = ?, latest_at = ?, reading_source = ?
       WHERE id = ?`,
      JSON.stringify(baseline),
      JSON.stringify(latest),
      baselineAt,
      now,
      "demo",
      round.id,
    );
  }
}

async function applyCache(open: RoundRow[], source: "demo" | "live", now: number) {
  const cache = new Map((await cachedReadings()).filter((row) => row.source === source).map((row) => [row.category, row]));
  for (const round of open) {
    const categories = JSON.parse(round.categories) as CategoryId[];
    const baseline = parseReadings(round.baseline_json);
    const latest = parseReadings(round.latest_json);
    const switching = round.reading_source != null && round.reading_source !== source;
    const base = switching ? {} : baseline;
    const next = switching ? {} : latest;
    let touched = false;
    for (const category of categories) {
      const row = cache.get(category);
      if (!row) continue;
      const reading = { volume: row.volume, tx: row.tx };
      if (!base[category]) {
        base[category] = source === "demo" ? demoReading(category, round.starts_at) : reading;
        touched = true;
      }
      next[category] = reading;
      touched = true;
    }
    if (!touched && !switching) continue;
    const baselineAt = switching || !round.baseline_at ? now : round.baseline_at;
    await run(
      `UPDATE rounds
       SET baseline_json = ?, latest_json = ?, baseline_at = ?, latest_at = ?, reading_source = ?
       WHERE id = ?`,
      JSON.stringify(base),
      JSON.stringify(next),
      baselineAt,
      now,
      source,
      round.id,
    );
  }
}

function parseReadings(raw: string | null): Partial<Record<CategoryId, Reading>> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Record<CategoryId, Reading>>;
  } catch {
    return {};
  }
}

async function collapseDuplicateCredits() {
  if (await metaGet("payout_once_v1")) return;
  const entries = await rows(
    "SELECT id, user_id, ref, amount, reason, payload FROM ledger WHERE reason IN ('payout', 'referral') ORDER BY id ASC",
  );
  const seen = new Set<string>();
  const extra = new Map<number, number>();
  for (const row of entries) {
    let from = "";
    if (String(row.reason) === "referral" && row.payload) {
      try {
        from = String((JSON.parse(String(row.payload)) as { fromUserId?: number }).fromUserId ?? "");
      } catch {
        from = "";
      }
    }
    const key = `${row.reason}:${row.user_id}:${String(row.ref ?? "")}:${from}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    const userId = Number(row.user_id);
    extra.set(userId, (extra.get(userId) ?? 0) + (Number(row.amount) || 0));
  }
  for (const [userId, amount] of extra) {
    if (amount <= 0) continue;
    const user = await userById(userId);
    if (!user || user.aura <= 0) continue;
    await credit(user, -Math.min(amount, user.aura), "payout-correction", "duplicate", {
      note: "duplicate tide payout",
    });
  }
  await metaSet("payout_once_v1", "1");
}

async function alreadyCredited(userId: number, reason: string, ref: string, fromUserId?: number) {
  const found = await rows(
    "SELECT payload FROM ledger WHERE user_id = ? AND reason = ? AND ref = ?",
    userId,
    reason,
    ref,
  );
  if (fromUserId == null) return found.length > 0;
  return found.some((row) => {
    try {
      return Number(JSON.parse(String(row.payload)).fromUserId) === fromUserId;
    } catch {
      return false;
    }
  });
}

function clockRefund(round: RoundRow) {
  try {
    const parsed = JSON.parse(round.result_json ?? "") as { reason?: string };
    return parsed.reason === "clock changed";
  } catch {
    return false;
  }
}

async function settleRound(round: RoundRow, now: number) {
  if (round.status !== "settling") {
    const claimed = await run(
      "UPDATE rounds SET status = 'settling' WHERE id = ? AND status = 'open'",
      round.id,
    );
    if (!claimed.changes) return;
    round.status = "settling";
  }
  if (clockRefund(round)) {
    const bets = await loadBets(round.id);
    await payRefunds(round, bets, "the tide clock changed");
    await run(
      "UPDATE rounds SET status = 'settled', result_json = ? WHERE id = ?",
      JSON.stringify({ refund: true, reason: "clock changed" }),
      round.id,
    );
    return;
  }
  const categories = JSON.parse(round.categories) as CategoryId[];
  const baseline = parseReadings(round.baseline_json);
  const latest = parseReadings(round.latest_json);
  const metric = round.kind === "volume" ? "volume" : "tx";
  const missing = categories.some((id) => baseline[id] == null || latest[id] == null);
  const bets = await loadBets(round.id);
  if (missing) {
    await payRefunds(round, bets, "not enough readings, stakes returned");
    await run(
      "UPDATE rounds SET status = 'settled', result_json = ? WHERE id = ?",
      JSON.stringify({ refund: true, reason: "missing readings" }),
      round.id,
    );
    return;
  }
  const changes = categories.map((category) => ({
    category,
    change: relativeChange(baseline[category]![metric], latest[category]![metric]),
  }));
  await askedPlace(round);
  const mode: Mode = round.mode === "stability" ? "movement" : round.mode;
  const settlement = settle({ mode, changes, bets });
  for (const payout of settlement.payouts) {
    const user = await userById(payout.userId);
    if (!user) continue;
    const reason = settlement.refund ? "round-refund" : "payout";
    if (await alreadyCredited(user.id, reason, round.id)) continue;
    await credit(user, payout.stakeBack + payout.profit, reason, round.id, {
      stake: payout.stakeBack,
      profit: payout.profit,
    });
  }
  for (const bonus of settlement.referrals) {
    const user = await userById(bonus.userId);
    if (!user) continue;
    if (await alreadyCredited(user.id, "referral", round.id, bonus.fromUserId)) continue;
    await credit(user, bonus.amount, "referral", round.id, { fromUserId: bonus.fromUserId });
  }
  for (const rank of settlement.ranks) {
    const prior = await one("SELECT id FROM category_history WHERE round_id = ? AND category = ?", round.id, rank.category);
    if (prior) continue;
    await run(
      `INSERT INTO category_history(category, metric, change_pct, rank, round_id, settled_at)
       VALUES(?, ?, ?, ?, ?, ?)`,
      rank.category,
      metric,
      rank.change,
      rank.rank,
      round.id,
      now,
    );
  }
  await run(
    "UPDATE rounds SET status = 'settled', result_json = ? WHERE id = ?",
    JSON.stringify({ refund: settlement.refund, reason: settlement.reason, ranks: settlement.ranks }),
    round.id,
  );
}

async function payRefunds(round: RoundRow, bets: StoredBet[], reason: string) {
  const byUser = new Map<number, number>();
  for (const bet of bets) byUser.set(bet.userId, (byUser.get(bet.userId) ?? 0) + bet.amount);
  for (const [userId, amount] of byUser) {
    const user = await userById(userId);
    if (!user) continue;
    if (await alreadyCredited(user.id, "round-refund", round.id)) continue;
    await credit(user, amount, "round-refund", round.id, { reason });
  }
}

type UserRow = {
  id: number;
  address: string;
  x_handle: string;
  role: Role;
  evidence: string;
  aura: number;
  referrer_id: number | null;
  referral_code: string;
  x_user_id: string | null;
  last_grant_on: string | null;
  created_at: string;
};

async function userById(id: number) {
  return (await one("SELECT * FROM users WHERE id = ?", id)) as UserRow | null;
}

async function loadBets(roundId: string): Promise<StoredBet[]> {
  return (await rows(
    `SELECT b.id, b.user_id, b.category, b.rank, b.amount, b.role, u.referrer_id
     FROM bets b JOIN users u ON u.id = b.user_id
     WHERE b.round_id = ?`,
    roundId,
  )).map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    category: String(row.category) as CategoryId,
    rank: Number(row.rank),
    amount: Number(row.amount),
    role: String(row.role) as Role,
    referrerId: row.referrer_id == null ? null : Number(row.referrer_id),
  }));
}

async function credit(
  user: UserRow,
  amount: number,
  reason: string,
  ref: string,
  extra: Record<string, unknown>,
) {
  if (amount === 0) return;
  const next = user.aura + amount;
  if (next < 0) throw new Error("Not enough Aura");
  const nonce = randomBytes(8).toString("hex");
  const signed = await signReceipt({
    action: reason,
    address: user.address,
    amount,
    ref,
    nonce,
  });
  await run("UPDATE users SET aura = ? WHERE id = ?", next, user.id);
  await run(
    `INSERT INTO ledger(user_id, amount, reason, ref, message, signature, created_at, payload)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    amount,
    reason,
    ref,
    signed.message,
    signed.signature,
    new Date().toISOString(),
    JSON.stringify(extra),
  );
  user.aura = next;
}

export async function createNonce() {
  const nonce = randomBytes(16).toString("hex");
  await run("DELETE FROM nonces WHERE created_at < ?", Date.now() - 15 * 60 * 1000);
  await run("INSERT INTO nonces(nonce, created_at) VALUES(?, ?)", nonce, Date.now());
  return nonce;
}

export async function enterSea(input: {
  address: string;
  xHandle: string;
  xUserId: string;
  followers: number | null;
  signature: `0x${string}`;
  nonce: string;
  referral: string;
}) {
  const gate = await withLock(async () => {
    const address = checksum(input.address);
    const handle = normalizeHandle(input.xHandle);
    if (!address) throw new Error("An EVM wallet is required");
    if (!validHandle(handle)) throw new Error("X handle: 1–15 letters, numbers, or _");
    const nonceRow = await one("SELECT nonce FROM nonces WHERE nonce = ?", input.nonce);
    if (!nonceRow) throw new Error("Signature expired. Request a new one");
    await run("DELETE FROM nonces WHERE nonce = ?", input.nonce);
    const referral = input.referral.trim().toLowerCase();
    const message = registerMessage({ address, xHandle: handle, referral, nonce: input.nonce });
    const valid = await verifyMessage({ address, message, signature: input.signature });
    if (!valid) throw new Error("Signature does not match");
    const existing = await one("SELECT * FROM users WHERE address = ?", address.toLowerCase()) as UserRow | null;
    if (existing) {
      if (existing.x_handle !== handle) throw new Error(`This wallet is already linked to @${existing.x_handle}`);
      const granted = await grantIfNeeded(existing);
      return {
        kind: "login" as const,
        token: await openSession(existing.id),
        role: existing.role,
        grant: granted.granted,
        day: granted.day,
      };
    }
    const taken = await one("SELECT id FROM users WHERE x_handle = ?", handle);
    if (taken) throw new Error("That X handle is already in the sea");
    return { kind: "new" as const, address, handle, referral, message, signature: input.signature };
  });
  if (gate.kind === "login") {
    return { token: gate.token, created: false, role: gate.role, grant: gate.grant, day: gate.day };
  }

  const classified = nansenKey()
    ? await classifyWallet(gate.address)
    : {
        role: "shrimp" as const,
        evidence: {
          chain: "demo",
          balanceUsd: null,
          tradedTimes: null,
          winRate: null,
          volumeUsd: null,
          activeDays: null,
          publicFigureChecked: false as const,
          note: "Demo without a Nansen key: Shrimp aura. With a key, the role is scored once from the wallet.",
          xFollowers: input.followers,
        },
      };
  if (input.followers != null) classified.evidence.xFollowers = input.followers;

  return withLock(async () => {
    const again = await one("SELECT id FROM users WHERE address = ?", gate.address.toLowerCase());
    if (again) throw new Error("This wallet already entered. Refresh the page");
    const seaHasPlayers = Number((await one("SELECT COUNT(*) AS n FROM users"))?.n ?? 0) > 0;
    if (seaHasPlayers && (!gate.referral || gate.referral === "-")) {
      throw new Error("A referral code is required");
    }
    let referrerId: number | null = null;
    if (gate.referral && gate.referral !== "-") {
      const referrer = await one("SELECT id, address FROM users WHERE referral_code = ?", gate.referral) as
        | { id: number; address: string }
        | null;
      if (!referrer) throw new Error("Referral code not found");
      if (referrer.address === gate.address.toLowerCase()) throw new Error("You cannot refer yourself");
      referrerId = referrer.id;
    }
    const takenX = await one("SELECT id FROM users WHERE x_user_id = ?", input.xUserId);
    if (takenX) throw new Error("That X account is already in the sea");
    const idRow = await run(
      `INSERT INTO users(address, x_handle, x_user_id, role, evidence, aura, referrer_id, referral_code, register_message, register_signature, last_grant_on, created_at)
       VALUES(?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?)`,
      gate.address.toLowerCase(),
      gate.handle,
      input.xUserId,
      classified.role,
      JSON.stringify(classified.evidence),
      referrerId,
      await referralCode(gate.handle),
      gate.message,
      gate.signature,
      new Date().toISOString(),
    );
    const user = await userById(Number(idRow.lastInsertRowid));
    if (!user) throw new Error("Could not create the profile");
    const granted = await grantIfNeeded(user, true);
    return { token: await openSession(user.id), created: true, role: user.role, grant: granted.granted, day: granted.day };
  });
}

async function referralCode(handle: string) {
  const base = normalizeHandle(handle);
  const clash = await one("SELECT id FROM users WHERE referral_code = ?", base);
  if (!clash) return base;
  return `${base}${randomBytes(1).toString("hex")}`;
}

async function openSession(userId: number) {
  const token = randomBytes(24).toString("hex");
  await run("INSERT INTO sessions(token, user_id, created_at) VALUES(?, ?, ?)", token, userId, new Date().toISOString());
  return token;
}

export async function grantIfNeeded(user: UserRow, first = false) {
  const today = grantKey(Date.now());
  const amount = user.role === "whale" ? WHALE_DAILY_AURA : DAILY_AURA;
  if (user.last_grant_on === today) return { user, granted: null as number | null, day: today };
  const updated = await run(
    "UPDATE users SET last_grant_on = ? WHERE id = ? AND (last_grant_on IS NULL OR last_grant_on < ?)",
    today,
    user.id,
    today,
  );
  if (Number(updated.changes) !== 1) return { user: (await userById(user.id)) ?? user, granted: null as number | null, day: today };
  const fresh = await userById(user.id);
  if (!fresh) return { user, granted: null as number | null, day: today };
  await credit(fresh, amount, first ? "register-grant" : "daily-grant", today, {});
  return { user: (await userById(user.id)) ?? fresh, granted: amount, day: today };
}

export async function placeBets(input: {
  token: string;
  roundId: string;
  lines: BetLine[];
  signature: `0x${string}`;
  nonce: string;
}) {
  return withLock(async () => {
    const user = await sessionUser(input.token);
    if (!user) throw new Error("Enter the sea first");
    const round = await one("SELECT * FROM rounds WHERE id = ?", input.roundId) as RoundRow | null;
    if (!round || round.status !== "open") throw new Error("This round is already closed");
    if (Date.now() >= round.bets_close_at) throw new Error("Betting is closed");
    const categories = JSON.parse(round.categories) as string[];
    const place = await askedPlace(round);
    const lines = input.lines.filter((line) => line.amount > 0);
    if (!lines.length) throw new Error("Enter a stake");
    const seen = new Set<string>();
    for (const line of lines) {
      if (!isCategoryId(line.category) || !categories.includes(line.category)) throw new Error("That category is not in this round");
      if (!Number.isInteger(line.amount) || line.amount < 1) throw new Error("A stake must be a whole number of Aura");
      if (line.rank !== place) throw new Error("This round asks for one fixed place");
      if (seen.has(line.category)) throw new Error("One stake per category");
      seen.add(line.category);
    }
    const nonceRow = await one("SELECT nonce FROM nonces WHERE nonce = ?", input.nonce);
    if (!nonceRow) throw new Error("Signature expired. Request a new one");
    await run("DELETE FROM nonces WHERE nonce = ?", input.nonce);
    const address = checksum(user.address);
    if (!address) throw new Error("Profile wallet is invalid");
    const message = betMessage({ address, roundId: round.id, lines, nonce: input.nonce });
    const valid = await verifyMessage({ address, message, signature: input.signature });
    if (!valid) throw new Error("Signature does not match");

    const next = lines.reduce((sum, line) => sum + line.amount, 0);
    if (next > Math.floor(user.aura)) throw new Error("Not enough Aura");
    await credit(user, -next, "bet-lock", round.id, { lines });
    const nowIso = new Date().toISOString();
    for (const line of lines) {
      const existing = await one(
        "SELECT id, amount FROM bets WHERE round_id = ? AND user_id = ? AND category = ?",
        round.id,
        user.id,
        line.category,
      ) as { id: number; amount: number } | null;
      if (existing) {
        await run("UPDATE bets SET amount = ? WHERE id = ?", Number(existing.amount) + line.amount, existing.id);
      } else {
        await run(
          `INSERT INTO bets(round_id, user_id, category, rank, amount, role, created_at)
           VALUES(?, ?, ?, ?, ?, ?, ?)`,
          round.id,
          user.id,
          line.category,
          line.rank,
          line.amount,
          user.role,
          nowIso,
        );
      }
    }
    return await userById(user.id);
  });
}

async function sessionUser(token: string) {
  if (!token) return null;
  return await one(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    token,
  ) as UserRow | null;
}

export async function publicState(token: string | null): Promise<PublicState> {
  const now = Date.now();
  const volume = activeVolumeWindow(now);
  const tx = activeTxWindow(now);
  await ensureServerAccount();
  await closeStaleRounds(now);
  await Promise.all([ensureRound("volume", volume), ensureRound("tx", tx)]);
  const [viewerRow, open, population, nansen] = await Promise.all([
    token ? sessionUser(token) : Promise.resolve(null),
    rows("SELECT * FROM rounds WHERE status = 'open' ORDER BY starts_at ASC") as Promise<unknown> as Promise<RoundRow[]>,
    one("SELECT COUNT(*) AS n FROM users"),
    nansenStatus(now),
  ]);
  const playing = new Set([`volume:${new Date(volume.start).toISOString()}`, `tx:${new Date(tx.start).toISOString()}`]);
  const visible = open.filter((round) => playing.has(round.id));
  let viewer = viewerRow;
  let grant: PublicState["grant"] = null;
  if (viewerRow) {
    const granted = await grantIfNeeded(viewerRow);
    viewer = granted.user;
    if (granted.granted != null) grant = { amount: granted.granted, day: granted.day };
  }
  const [card, rounds] = await Promise.all([
    viewer ? toViewer(viewer) : Promise.resolve(null),
    Promise.all(visible.map((round) => toRound(round, now, viewer))),
  ]);
  scheduleTide(now, open);
  return {
    now,
    serverAddress: serverAccount().address,
    nansen,
    viewer: card,
    referralRequired: Number(population?.n ?? 0) > 0,
    grant,
    rounds,
  };
}

async function toViewer(user: UserRow): Promise<PublicState["viewer"]> {
  let evidence: RoleEvidence;
  try {
    evidence = JSON.parse(user.evidence) as RoleEvidence;
  } catch {
    evidence = {
      chain: "",
      balanceUsd: null,
      tradedTimes: null,
      winRate: null,
      volumeUsd: null,
      activeDays: null,
      publicFigureChecked: false,
      note: "",
    };
  }
  const receipts = (await rows(
    "SELECT amount, reason, signature, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 8",
    user.id,
  )).map((row) => ({
    amount: Number(row.amount),
    reason: String(row.reason),
    signature: String(row.signature),
    createdAt: String(row.created_at),
  }));
  return {
    address: user.address,
    xHandle: user.x_handle,
    role: user.role,
    aura: Math.floor(user.aura),
    referralCode: user.referral_code,
    evidence,
    receipts,
  };
}

async function toRound(round: RoundRow, now: number, viewer: UserRow | null) {
  const place = await askedPlace(round);
  const categories = JSON.parse(round.categories) as CategoryId[];
  const baseline = parseReadings(round.baseline_json);
  const latest = parseReadings(round.latest_json);
  const metric = round.kind === "volume" ? "volume" : "tx";
  const known = categories
    .filter((id) => baseline[id] && latest[id])
    .map((id) => ({
      category: id,
      change: relativeChange(baseline[id]![metric], latest[id]![metric]),
    }));
  const mode: Mode = round.mode === "stability" ? "movement" : round.mode;
  const ranked = known.length === categories.length ? rankCategories(mode, known) : [];
  const changeOf = new Map(known.map((row) => [row.category, row.change]));
  const rankOf = new Map(ranked.map((row) => [row.category, row.rank]));
  const bets = await loadBets(round.id);
  const tide = shrimpTide(bets, categories);
  const spotlight = whaleSpotlight(bets, categories);
  const poolTotal = bets.reduce((sum, bet) => sum + bet.amount, 0);
  const showShrimp = viewer?.role === "shrimp";
  const showDolphin = viewer?.role === "dolphin";
  const myBets = viewer
    ? bets
        .filter((bet) => bet.userId === viewer.id)
        .map((bet) => ({ category: bet.category, rank: bet.rank, amount: bet.amount }))
    : [];
  return {
    id: round.id,
    kind: round.kind,
    title: roundTitle(round.kind),
    question: roundQuestion(mode, round.kind, place),
    mode,
    place,
    phase: phaseOf(now, { start: round.starts_at, betsClose: round.bets_close_at, end: round.ends_at }),
    startsAt: round.starts_at,
    betsCloseAt: round.bets_close_at,
    endsAt: round.ends_at,
    late: round.reading_source === "live" && round.baseline_at != null && round.baseline_at - round.starts_at > 10 * 60 * 1000,
    poolTotal,
    betCount: bets.length,
    shrimpVeil: showShrimp ? { veiled: tide.veiled, bets: tide.bets } : null,
    myBets,
    categories: await Promise.all(categories.map(async (id) => {
      const spec = categoryById(id);
      const yesterday = showDolphin ? await yesterdayFor(id, metric, round.starts_at) : null;
      return {
        id,
        title: spec?.title ?? id,
        changePct: changeOf.get(id) ?? null,
        rank: rankOf.get(id) ?? null,
        whale: spotlight === id,
        yesterday,
        shrimpShare: showShrimp ? (tide.shares[id] ?? 0) : null,
      };
    })),
  };
}

async function yesterdayFor(category: string, metric: string, _before: number) {
  const row = await one(
    `SELECT change_pct, rank FROM category_history
     WHERE category = ? AND metric = ?
     ORDER BY settled_at DESC LIMIT 1`,
    category,
    metric,
  );
  if (!row) return null;
  return { changePct: Number(row.change_pct), rank: Number(row.rank) };
}

export async function logout(token: string) {
  if (token) await run("DELETE FROM sessions WHERE token = ?", token);
}

export async function walletKnown(address: string) {
  const checksummed = checksum(address);
  if (!checksummed) return false;
  return Boolean(await one("SELECT id FROM users WHERE address = ?", checksummed.toLowerCase()));
}

export async function loginSea(input: { address: string; signature: `0x${string}`; nonce: string }) {
  return withLock(async () => {
    const address = checksum(input.address);
    if (!address) throw new Error("An EVM wallet is required");
    const nonceRow = await one("SELECT nonce FROM nonces WHERE nonce = ?", input.nonce);
    if (!nonceRow) throw new Error("Signature expired. Request a new one");
    await run("DELETE FROM nonces WHERE nonce = ?", input.nonce);
    const message = loginMessage({ address, nonce: input.nonce });
    const valid = await verifyMessage({ address, message, signature: input.signature });
    if (!valid) throw new Error("Signature does not match");
    const existing = await one("SELECT * FROM users WHERE address = ?", address.toLowerCase()) as UserRow | null;
    if (!existing) throw new Error("This wallet has not entered yet");
    const granted = await grantIfNeeded(existing);
    return { token: await openSession(existing.id), grant: granted.granted, day: granted.day, role: existing.role };
  });
}

export async function gamesFor(token: string): Promise<TideResult[] | null> {
  const user = await sessionUser(token);
  if (!user) return null;
  const betRows = await rows(
    `SELECT r.id, r.kind, r.mode, r.place, r.starts_at, r.status, r.result_json, r.categories, b.category, b.amount, b.rank
     FROM bets b JOIN rounds r ON r.id = b.round_id
     WHERE b.user_id = ?
     ORDER BY r.starts_at ASC, b.id ASC`,
    user.id,
  );
  const ledgerRows = await rows(
    "SELECT id, ref, reason, payload FROM ledger WHERE user_id = ? AND reason IN ('payout', 'round-refund') ORDER BY id ASC",
    user.id,
  );
  const profitOf = new Map<string, number>();
  const returned = new Set<string>();
  for (const row of ledgerRows) {
    const ref = String(row.ref ?? "");
    if (row.reason === "round-refund") returned.add(ref);
    if (row.reason !== "payout" || !row.payload || profitOf.has(ref)) continue;
    try {
      const payload = JSON.parse(String(row.payload)) as { profit?: number; stake?: number };
      const received = (Number(payload.stake) || 0) + (Number(payload.profit) || 0);
      profitOf.set(ref, (profitOf.get(ref) ?? 0) + received);
    } catch {
      /* older rows have no split */
    }
  }
  const grouped = new Map<string, TideResult>();
  const lineup = new Map<string, string[]>();
  for (const row of betRows) {
    const roundId = String(row.id);
    const settled = String(row.status) === "settled";
    let refund = returned.has(roundId);
    let ranks: { category: string; rank: number }[] = [];
    if (settled) {
      try {
        const parsed = JSON.parse(String(row.result_json ?? "{}")) as {
          refund?: boolean;
          ranks?: { category: string; rank: number }[];
        };
        refund = refund || Boolean(parsed.refund);
        ranks = parsed.ranks ?? [];
      } catch {
        ranks = [];
      }
    }
    const pickWon =
      settled && !refund
        ? ranks.some((rank) => rank.category === String(row.category) && rank.rank === Number(row.rank))
        : null;
    let game = grouped.get(roundId);
    if (!game) {
      const mode = String(row.mode) === "growth" ? "growth" : "movement";
      const place = Number(row.place) || 1;
      let status: TideResult["status"] = "open";
      if (refund) status = "returned";
      else if (settled) status = pickWon ? "won" : "lost";
      game = {
        roundId,
        title: roundTitle(String(row.kind) === "volume" ? "volume" : "tx"),
        question: roundQuestion(mode, String(row.kind) === "volume" ? "volume" : "tx", place),
        startsAt: Number(row.starts_at),
        status,
        stake: 0,
        pool: 0,
        profit: settled && !refund ? (profitOf.get(roundId) ?? 0) : 0,
        lost: 0,
        picks: [],
      };
      grouped.set(roundId, game);
      try {
        lineup.set(roundId, JSON.parse(String(row.categories ?? "[]")) as string[]);
      } catch {
        lineup.set(roundId, []);
      }
    } else if (pickWon) {
      game.status = "won";
    }
    const amount = Number(row.amount);
    game.stake += amount;
    if (pickWon === false) game.lost += amount;
    game.picks.push({
      title: categoryById(String(row.category))?.title ?? String(row.category),
      amount,
      won: pickWon,
    });
  }
  const pools = new Map<string, number>();
  for (const row of await rows("SELECT round_id, amount FROM bets")) {
    const id = String(row.round_id);
    pools.set(id, (pools.get(id) ?? 0) + (Number(row.amount) || 0));
  }
  for (const game of grouped.values()) {
    game.pool = pools.get(game.roundId) ?? game.stake;
    const have = new Map(game.picks.map((pick) => [pick.title, pick]));
    const titles = (lineup.get(game.roundId) ?? []).map((id) => categoryById(id)?.title ?? id);
    if (titles.length) {
      game.picks = titles.map((title) => have.get(title) ?? { title, amount: 0, won: null });
    }
  }
  return [...grouped.values()];
}

export async function referralsFor(token: string): Promise<{ code: string; rows: ReferralRow[] } | null> {
  const user = await sessionUser(token);
  if (!user) return null;
  const people = await rows(
    `SELECT u.id, u.x_handle, u.role, u.created_at
     FROM users u
     WHERE u.referrer_id = ?
     ORDER BY u.created_at ASC`,
    user.id,
  );
  const map = new Map<number, ReferralRow>();
  for (const row of people) {
    map.set(Number(row.id), {
      xHandle: String(row.x_handle),
      role: (String(row.role) || "shrimp") as Role,
      earned: 0,
      joinedAt: String(row.created_at),
    });
  }
  const bonuses = await rows(
    "SELECT id, amount, payload FROM ledger WHERE user_id = ? AND reason = 'referral' ORDER BY id ASC",
    user.id,
  );
  const seenBonus = new Set<number>();
  for (const row of bonuses) {
    if (!row.payload) continue;
    try {
      const payload = JSON.parse(String(row.payload)) as { fromUserId?: number };
      const fromUserId = Number(payload.fromUserId);
      if (seenBonus.has(fromUserId)) continue;
      seenBonus.add(fromUserId);
      const entry = map.get(fromUserId);
      if (entry) entry.earned += Number(row.amount) || 0;
    } catch {
      /* skip a broken payload */
    }
  }
  const unique = new Map<string, ReferralRow>();
  for (const entry of map.values()) {
    const key = entry.xHandle.toLowerCase();
    const current = unique.get(key);
    if (current) current.earned += entry.earned;
    else unique.set(key, { ...entry });
  }
  return { code: user.referral_code, rows: [...unique.values()] };
}

type CachedLeaderboardRow = {
  userId: number;
  xHandle: string;
  role: Role;
  aura: number;
};

type CachedLeaderboard = {
  refreshedAt: number;
  rows: CachedLeaderboardRow[];
};

export async function leaderboardFor(token: string): Promise<LeaderboardBoard | null> {
  const user = await sessionUser(token);
  if (!user) return null;
  const now = Date.now();
  let cached: CachedLeaderboard | null = null;
  try {
    cached = JSON.parse(await metaGet("leaderboard_cache") ?? "null") as CachedLeaderboard | null;
  } catch {
    cached = null;
  }
  const stale = !cached || cached.rows.some((row) => !row.role) || now - cached.refreshedAt >= 60 * 60 * 1000;
  const missingViewer = !cached?.rows.some((row) => row.userId === user.id);
  if (stale || missingViewer) {
    cached = {
      refreshedAt: now,
      rows: (await rows("SELECT id, x_handle, role, aura FROM users ORDER BY aura DESC, id ASC")).map((row) => ({
        userId: Number(row.id),
        xHandle: String(row.x_handle),
        role: (String(row.role) || "shrimp") as Role,
        aura: Math.floor(Number(row.aura)),
      })),
    };
    await metaSet("leaderboard_cache", JSON.stringify(cached));
  }
  const board = cached as CachedLeaderboard;
  const currentRank = Math.max(1, board.rows.findIndex((row) => row.userId === user.id) + 1);
  return {
    refreshedAt: board.refreshedAt,
    currentRank,
    rows: board.rows.slice(0, 50).map((row, index) => ({
      rank: index + 1,
      xHandle: row.xHandle,
      role: row.role,
      aura: row.aura,
      viewer: row.userId === user.id,
    })),
  };
}
