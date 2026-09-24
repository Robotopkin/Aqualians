import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const kind = process.argv[2] === "tx" ? "tx" : "volume";
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await db
  .from("rounds")
  .select("id, kind, starts_at, baseline_at, reading_source, status")
  .eq("kind", kind)
  .order("starts_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (error) throw new Error(error.message);
if (!data) throw new Error(`No ${kind} round exists`);
if (data.status !== "open") throw new Error(`${data.id} is not open`);
if (data.reading_source !== "live" || !data.baseline_at) {
  throw new Error(`${data.id} has no live Nansen opening snapshot`);
}

const calls = await db.from("api_calls").select("*", { count: "exact", head: true });
if (calls.error) throw new Error(calls.error.message);
if (!calls.count) throw new Error("No Nansen API calls were recorded");

console.log(
  JSON.stringify({
    round: data.id,
    startsAt: data.starts_at,
    baselineAt: data.baseline_at,
    source: data.reading_source,
    nansenCalls: calls.count,
  }),
);
