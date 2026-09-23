import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const globalForDb = globalThis as unknown as { auraseaDb?: DatabaseSync };

function filePath() {
  const custom = process.env.AURASEA_DB?.trim();
  if (custom) return custom;
  if (process.env.VERCEL) return path.join(os.tmpdir(), "aurasea.db");
  return path.join(process.cwd(), "data", "aurasea.db");
}

export function getDb() {
  if (!globalForDb.auraseaDb) {
    const file = filePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 3000;");
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    globalForDb.auraseaDb = db;
  }
  return globalForDb.auraseaDb;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      address TEXT NOT NULL UNIQUE,
      x_handle TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      evidence TEXT NOT NULL,
      aura INTEGER NOT NULL DEFAULT 0,
      referrer_id INTEGER,
      referral_code TEXT NOT NULL UNIQUE,
      last_grant_on TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nonces (
      nonce TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      mode TEXT NOT NULL,
      categories TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      bets_close_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      baseline_json TEXT,
      latest_json TEXT,
      baseline_at INTEGER,
      latest_at INTEGER,
      reading_source TEXT,
      result_json TEXT
    );

    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY,
      round_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      rank INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref TEXT,
      message TEXT NOT NULL,
      signature TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sector_cache (
      category TEXT PRIMARY KEY,
      volume REAL NOT NULL,
      tx REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_history (
      id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      metric TEXT NOT NULL,
      change_pct REAL NOT NULL,
      rank INTEGER NOT NULL,
      round_id TEXT NOT NULL,
      settled_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_calls (
      id INTEGER PRIMARY KEY,
      endpoint TEXT NOT NULL,
      status INTEGER NOT NULL,
      credits INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS bets_round ON bets(round_id);
    CREATE INDEX IF NOT EXISTS bets_user ON bets(user_id);
    CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id);
    CREATE INDEX IF NOT EXISTS api_calls_time ON api_calls(created_at);
    CREATE INDEX IF NOT EXISTS history_lookup ON category_history(category, metric, settled_at);
    CREATE INDEX IF NOT EXISTS users_referrer ON users(referrer_id);
  `);
  const roundCols = db.prepare("PRAGMA table_info(rounds)").all() as { name: string }[];
  if (!roundCols.some((col) => col.name === "place")) {
    db.exec("ALTER TABLE rounds ADD COLUMN place INTEGER");
  }
  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols.some((col) => col.name === "x_user_id")) {
    db.exec("ALTER TABLE users ADD COLUMN x_user_id TEXT");
  }
  if (!userCols.some((col) => col.name === "register_message")) {
    db.exec("ALTER TABLE users ADD COLUMN register_message TEXT");
  }
  if (!userCols.some((col) => col.name === "register_signature")) {
    db.exec("ALTER TABLE users ADD COLUMN register_signature TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_x_id ON users(x_user_id) WHERE x_user_id IS NOT NULL");
  const ledgerCols = db.prepare("PRAGMA table_info(ledger)").all() as { name: string }[];
  if (!ledgerCols.some((col) => col.name === "payload")) {
    db.exec("ALTER TABLE ledger ADD COLUMN payload TEXT");
  }
}

export type SqlRow = Record<string, unknown>;

export function rows(sql: string, ...params: (string | number | null | bigint)[]) {
  return getDb().prepare(sql).all(...params) as SqlRow[];
}

export function one(sql: string, ...params: (string | number | null | bigint)[]) {
  return (getDb().prepare(sql).get(...params) as SqlRow | undefined) ?? null;
}

export function run(sql: string, ...params: (string | number | null | bigint)[]) {
  return getDb().prepare(sql).run(...params);
}

export function metaGet(key: string) {
  const row = one("SELECT value FROM meta WHERE key = ?", key);
  return row ? String(row.value) : null;
}

export function metaSet(key: string, value: string) {
  run(
    "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}
