import assert from "node:assert/strict";
import { settle } from "../lib/payout.ts";
import type { CategoryId, Mode, Role, StoredBet } from "../lib/types.ts";

throw new Error("Demo seed is for the old local file. The shared sea is Supabase.");

const db = {
  prepare() {
    return { get() { return undefined; }, all() { return []; }, run() { return { lastInsertRowid: 0 }; } };
  },
  exec() {},
} as never;
const owner = db
  .prepare("SELECT id, x_handle FROM users WHERE referral_code = ? OR x_handle = ? LIMIT 1")
  .get("2f8b2a9b", "_robotopkin_") as
  | { id: number; x_handle: string }
  | undefined;

if (!owner) throw new Error("Could not find the local profile with referral code 2f8b2a9b");

const now = Date.now();
const createdAt = new Date(now).toISOString();
const categories: CategoryId[] = ["nft", "defi", "meme", "ai"];
const roleCounts: [Role, number][] = [
  ["whale", 5],
  ["shark", 5],
  ["dolphin", 5],
  ["shrimp", 20],
];

db.exec("BEGIN IMMEDIATE");
try {
  const oldIds = (
    db.prepare("SELECT id FROM users WHERE x_handle LIKE 'demo\\_%' ESCAPE '\\'").all() as { id: number }[]
  ).map((row) => row.id);
  for (const id of oldIds) {
    db.prepare("DELETE FROM bets WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM ledger WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  db.prepare("DELETE FROM ledger WHERE user_id = ? AND ref LIKE 'demo:%'").run(owner.id);
  db.prepare("DELETE FROM bets WHERE round_id LIKE 'demo:%'").run();
  db.prepare("DELETE FROM rounds WHERE id LIKE 'demo:%'").run();
  db.prepare("DELETE FROM users WHERE x_handle LIKE 'demo\\_%' ESCAPE '\\'").run();

  const ownerCode = owner.x_handle.toLowerCase();
  db.prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(ownerCode, owner.id);

  const fakeUsers: { id: number; role: Role; index: number }[] = [];
  let serial = 1;
  for (const [role, count] of roleCounts) {
    for (let index = 1; index <= count; index++) {
      const handle = `demo_${role}_${index}`;
      const address = `0x${serial.toString(16).padStart(40, "0")}`;
      const evidence = {
        chain: "demo",
        balanceUsd: null,
        tradedTimes: role === "shark" ? 1 : 0,
        winRate: role === "shark" ? 0.4 + index / 100 : null,
        volumeUsd: role === "whale" ? 10_000 + index * 1_000 : 0,
        activeDays: role === "dolphin" ? 14 + index : 0,
        publicFigureChecked: false,
        note: "Local demo profile",
      };
      const inserted = db
        .prepare(
          `INSERT INTO users(
             address, x_handle, x_user_id, role, evidence, aura, referrer_id, referral_code,
             register_message, register_signature, last_grant_on, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          address,
          handle,
          `demo-x-${serial}`,
          role,
          JSON.stringify(evidence),
          role === "whale" ? 3000 : 1000,
          owner.id,
          handle,
          "demo registration",
          "0xdemo",
          new Date(now).toISOString().slice(0, 10),
          new Date(now - serial * 3_600_000).toISOString(),
        );
      fakeUsers.push({ id: Number(inserted.lastInsertRowid), role, index });
      serial += 1;
    }
  }

  for (let roundIndex = 0; roundIndex < 6; roundIndex++) {
    const roundId = `demo:history:${roundIndex + 1}`;
    const mode: Mode = roundIndex % 2 === 0 ? "growth" : "movement";
    const place = (roundIndex % 4) + 1;
    const startsAt = now - (roundIndex + 2) * 86_400_000;
    const changes = categories.map((category, index) => ({
      category,
      change: mode === "growth" ? 0.4 - index * 0.13 : [0.04, -0.31, 0.18, -0.09][index]!,
    }));
    const stored: StoredBet[] = [];

    const addBet = (userId: number, role: Role, userIndex: number, referrerId: number | null) => {
      const category = categories[(userIndex + roundIndex) % categories.length]!;
      const amount = 20 + ((userIndex * 17 + roundIndex * 23) % 180);
      const inserted = db.prepare(
        `INSERT INTO bets(round_id, user_id, category, rank, amount, role, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ).run(roundId, userId, category, place, amount, role, createdAt);
      const bet: StoredBet = {
        id: Number(inserted.lastInsertRowid),
        userId,
        role,
        category,
        rank: place,
        amount,
        referrerId,
      };
      stored.push(bet);
    };

    db.prepare(
      `INSERT INTO rounds(
         id, kind, mode, categories, starts_at, bets_close_at, ends_at, status, place,
         baseline_json, latest_json, baseline_at, latest_at, reading_source
       ) VALUES(?, ?, ?, ?, ?, ?, ?, 'settled', ?, '{}', '{}', ?, ?, 'demo')`,
    ).run(
      roundId,
      roundIndex % 2 === 0 ? "volume" : "tx",
      mode,
      JSON.stringify(categories),
      startsAt,
      startsAt + 12 * 3_600_000,
      startsAt + 24 * 3_600_000,
      place,
      startsAt,
      startsAt + 24 * 3_600_000,
    );

    addBet(owner.id, "shrimp", roundIndex + 1, null);
    fakeUsers.forEach((user, index) => addBet(user.id, user.role, index + 1, owner.id));

    const settlement = settle({ mode, changes, bets: stored });
    db.prepare("UPDATE rounds SET result_json = ? WHERE id = ?").run(
      JSON.stringify({ refund: settlement.refund, reason: settlement.reason, ranks: settlement.ranks }),
      roundId,
    );
    for (const payout of settlement.payouts) {
      db.prepare(
        `INSERT INTO ledger(user_id, amount, reason, ref, message, signature, payload, created_at)
         VALUES(?, ?, 'payout', ?, 'demo payout', '0xdemo', ?, ?)`,
      ).run(
        payout.userId,
        payout.stakeBack + payout.profit,
        roundId,
        JSON.stringify({ stake: payout.stakeBack, profit: payout.profit }),
        createdAt,
      );
    }
    for (const referral of settlement.referrals) {
      db.prepare(
        `INSERT INTO ledger(user_id, amount, reason, ref, message, signature, payload, created_at)
         VALUES(?, ?, 'referral', ?, 'demo referral', '0xdemo', ?, ?)`,
      ).run(
        referral.userId,
        referral.amount,
        roundId,
        JSON.stringify({ fromUserId: referral.fromUserId }),
        createdAt,
      );
    }
    assert.ok(settlement.payouts.length > 0);
    assert.ok(settlement.referrals.every((row) => row.userId === owner.id));
  }

  const openRounds = db.prepare("SELECT id, categories, place FROM rounds WHERE status = 'open'").all() as {
    id: string;
    categories: string;
    place: number;
  }[];
  for (const [roundIndex, round] of openRounds.entries()) {
    const roundCategories = JSON.parse(round.categories) as CategoryId[];
    fakeUsers.forEach((user, index) => {
      const category = roundCategories[(index * 2 + user.index + roundIndex) % roundCategories.length]!;
      const amount = 10 + ((index * 29 + user.index * 7 + roundIndex * 41) % 240);
      db.prepare(
        `INSERT INTO bets(round_id, user_id, category, rank, amount, role, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ).run(round.id, user.id, category, round.place, amount, user.role, createdAt);
    });
  }

  const sharkCheck = settle({
    mode: "growth",
    changes: [
      { category: "nft", change: 0.5 },
      { category: "defi", change: 0.1 },
    ],
    bets: [
      { id: 1, userId: 10_001, role: "shark", category: "nft", rank: 1, amount: 100, referrerId: owner.id },
      { id: 2, userId: 10_002, role: "shrimp", category: "nft", rank: 1, amount: 100, referrerId: owner.id },
      { id: 3, userId: 10_003, role: "shrimp", category: "defi", rank: 1, amount: 210, referrerId: owner.id },
    ],
  });
  const sharkProfit = sharkCheck.payouts.find((row) => row.userId === 10_001)?.profit ?? 0;
  const shrimpProfit = sharkCheck.payouts.find((row) => row.userId === 10_002)?.profit ?? 0;
  assert.ok(sharkProfit > shrimpProfit);
  assert.equal(sharkCheck.referrals.reduce((sum, row) => sum + row.amount, 0), Math.floor(sharkProfit / 10) + Math.floor(shrimpProfit / 10));

  db.exec("COMMIT");
  console.log(`Seeded ${fakeUsers.length} demo referrals, 6 settled rounds, and ${openRounds.length} live round(s).`);
  console.log(`Referral code changed from 2f8b2a9b to ${ownerCode}.`);
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
