import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

const CONFIRMATION = "--confirm-production-reset";

if (!process.argv.includes(CONFIRMATION)) {
  throw new Error(`Refusing to clear Supabase without ${CONFIRMATION}`);
}

loadEnvConfig(process.cwd());

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function clear(table: string, keyColumn: string) {
  const { error } = await db.from(table).delete().not(keyColumn, "is", null);
  fail(error);
}

await clear("bets", "id");
await clear("ledger", "id");
await clear("sessions", "token");
await clear("category_history", "id");
await clear("rounds", "id");

const detached = await db.from("users").update({ referrer_id: null }).not("id", "is", null);
fail(detached.error);
await clear("users", "id");

await clear("nonces", "nonce");
await clear("sector_cache", "category");
await clear("api_calls", "id");
await clear("meta", "key");

const tables = [
  "users",
  "sessions",
  "nonces",
  "rounds",
  "bets",
  "ledger",
  "sector_cache",
  "category_history",
  "api_calls",
  "meta",
] as const;

for (const table of tables) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  fail(error);
  if (count !== 0) throw new Error(`${table} still contains ${count ?? "unknown"} rows`);
}

console.log("Production Supabase data cleared; schema preserved.");
