import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SqlRow = Record<string, unknown>;
type Param = string | number | null | bigint;
type Filter = {
  eq: (column: string, value: unknown) => Filter;
  lte: (column: string, value: unknown) => Filter;
  gte: (column: string, value: unknown) => Filter;
  lt: (column: string, value: unknown) => Filter;
  in: (column: string, values: unknown[]) => Filter;
  or: (filters: string) => Filter;
  order: (column: string, options: { ascending: boolean }) => Filter;
  limit: (count: number) => Filter;
  select: (columns?: string) => PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }>;
};

const globalForDb = globalThis as unknown as { auraseaSb?: SupabaseClient };
const NUMERIC = new Set([
  "id",
  "aura",
  "amount",
  "rank",
  "place",
  "volume",
  "tx",
  "change_pct",
  "credits",
  "status",
  "referrer_id",
  "user_id",
  "starts_at",
  "bets_close_at",
  "ends_at",
  "baseline_at",
  "latest_at",
  "updated_at",
  "settled_at",
]);

export function supabase() {
  if (!globalForDb.auraseaSb) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) throw new Error("Supabase is not configured");
    globalForDb.auraseaSb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return globalForDb.auraseaSb;
}

function clean(value: Param) {
  return typeof value === "bigint" ? Number(value) : value;
}

function coerce(row: SqlRow): SqlRow {
  const out: SqlRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && NUMERIC.has(key) && /^-?\d+(\.\d+)?$/.test(value)) out[key] = Number(value);
    else out[key] = value;
  }
  return out;
}

function raise(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function norm(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

function splitCsv(input: string) {
  return input.split(",").map((part) => part.trim());
}

function applyWhere(query: Filter, where: string, params: unknown[]) {
  let index = 0;
  const take = () => params[index++];
  for (const part of where.split(/\s+AND\s+/i)) {
    const eq = part.match(/^(\w+)\s*=\s*\?$/);
    if (eq) {
      query = query.eq(eq[1], take());
      continue;
    }
    const literal = part.match(/^(\w+)\s*=\s*'([^']*)'$/);
    if (literal) {
      query = query.eq(literal[1], literal[2]);
      continue;
    }
    const lte = part.match(/^(\w+)\s*<=\s*\?$/);
    if (lte) {
      query = query.lte(lte[1], take());
      continue;
    }
    const gte = part.match(/^(\w+)\s*>=\s*\?$/);
    if (gte) {
      query = query.gte(gte[1], take());
      continue;
    }
    const lt = part.match(/^(\w+)\s*<\s*\?$/);
    if (lt) {
      query = query.lt(lt[1], take());
      continue;
    }
    const list = part.match(/^(\w+)\s+IN\s*\(([^)]+)\)$/i);
    if (list) {
      query = query.in(
        list[1],
        list[2].split(",").map((item) => item.trim().replace(/^'|'$/g, "")),
      );
      continue;
    }
    throw new Error(`Unsupported filter: ${part}`);
  }
  return query;
}

function applyOrder(query: Filter, order: string) {
  for (const piece of order.split(",")) {
    const match = piece.trim().match(/^(\w+)(?:\s+(ASC|DESC))?$/i);
    if (!match) throw new Error(`Unsupported order: ${piece}`);
    query = query.order(match[1], { ascending: (match[2] ?? "ASC").toUpperCase() !== "DESC" });
  }
  return query;
}

function valuesOf(raw: string, params: unknown[]) {
  let index = 0;
  return splitCsv(raw).map((token) => {
    if (token === "?") return params[index++];
    if (token === "NULL") return null;
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    const quoted = token.match(/^'(.*)'$/);
    if (quoted) return quoted[1];
    throw new Error(`Unsupported value: ${token}`);
  });
}

async function selectRows(sql: string, params: unknown[]): Promise<SqlRow[]> {
  if (sql.includes(" JOIN ")) return selectJoin(sql, params);
  const count = sql.match(/^SELECT COUNT\(\*\) AS n FROM (\w+)(?: WHERE (.+))?$/);
  if (count) {
    let query = supabase().from(count[1]).select("*", { count: "exact", head: true }) as unknown as Filter;
    if (count[2]) query = applyWhere(query, count[2], params);
    const counted = await (query as unknown as Promise<{ error: { message: string } | null; count: number | null }>);
    raise(counted.error);
    return [{ n: counted.count ?? 0 }];
  }
  const parsed = sql.match(/^SELECT (.+) FROM (\w+)(?:\s+[a-z])?(.*)$/);
  if (!parsed) throw new Error(`Unsupported read: ${sql}`);
  let rest = parsed[3].trim();
  let limit: number | null = null;
  const limitMatch = rest.match(/\sLIMIT\s+(\d+)$/);
  if (limitMatch && limitMatch.index != null) {
    limit = Number(limitMatch[1]);
    rest = rest.slice(0, limitMatch.index).trim();
  }
  let order = "";
  const orderMatch = rest.match(/\sORDER BY\s+(.+)$/);
  if (orderMatch && orderMatch.index != null) {
    order = orderMatch[1];
    rest = rest.slice(0, orderMatch.index).trim();
  }
  let where = "";
  if (rest) {
    const whereMatch = rest.match(/^WHERE\s+(.+)$/);
    if (!whereMatch) throw new Error(`Unsupported read: ${sql}`);
    where = whereMatch[1];
  }
  const columns = parsed[1]
    .split(",")
    .map((column) => column.trim().replace(/^[a-z]\./, ""))
    .join(", ");
  let query = supabase().from(parsed[2]).select(columns) as unknown as Filter;
  if (where) query = applyWhere(query, where, params);
  if (order) query = applyOrder(query, order);
  if (limit) query = query.limit(limit);
  const selected = await (query as unknown as Promise<{ data: unknown; error: { message: string } | null }>);
  raise(selected.error);
  return ((selected.data as SqlRow[] | null) ?? []).map(coerce);
}

async function selectJoin(sql: string, params: unknown[]): Promise<SqlRow[]> {
  if (sql.startsWith("SELECT b.id, b.user_id, b.category, b.rank, b.amount, b.role, u.referrer_id FROM bets b JOIN users u")) {
    const { data, error } = await supabase()
      .from("bets")
      .select("id, user_id, category, rank, amount, role, users(referrer_id)")
      .eq("round_id", params[0]);
    raise(error);
    return ((data as SqlRow[] | null) ?? []).map((row) => {
      const user = row.users as { referrer_id?: number | null } | { referrer_id?: number | null }[] | null;
      const joined = Array.isArray(user) ? user[0] : user;
      const { users: _users, ...rest } = row;
      return coerce({ ...rest, referrer_id: joined?.referrer_id ?? null });
    });
  }
  if (sql.startsWith("SELECT u.* FROM sessions s JOIN users u")) {
    const { data, error } = await supabase().from("sessions").select("users(*)").eq("token", params[0]).maybeSingle();
    raise(error);
    const user = (data as { users?: SqlRow | SqlRow[] | null } | null)?.users;
    const row = Array.isArray(user) ? user[0] : user;
    return row ? [coerce(row)] : [];
  }
  if (sql.startsWith("SELECT r.id, r.kind, r.mode, r.place, r.starts_at, r.status, r.result_json, b.category, b.amount, b.rank")) {
    const { data, error } = await supabase()
      .from("bets")
      .select("id, category, amount, rank, rounds(id, kind, mode, place, starts_at, status, result_json)")
      .eq("user_id", params[0])
      .order("id", { ascending: true });
    raise(error);
    return ((data as SqlRow[] | null) ?? [])
      .map((row) => {
        const round = row.rounds as SqlRow | SqlRow[] | null;
        const joined = Array.isArray(round) ? round[0] : round;
        if (!joined) return null;
        return coerce({
          id: joined.id,
          kind: joined.kind,
          mode: joined.mode,
          place: joined.place,
          starts_at: joined.starts_at,
          status: joined.status,
          result_json: joined.result_json,
          category: row.category,
          amount: row.amount,
          rank: row.rank,
          bet_id: row.id,
        });
      })
      .filter((row): row is SqlRow => row != null)
      .sort((a, b) => Number(a.starts_at) - Number(b.starts_at) || Number(a.bet_id) - Number(b.bet_id));
  }
  throw new Error(`Unsupported read: ${sql}`);
}

async function mutate(sql: string, params: unknown[]) {
  if (sql.includes("last_grant_on IS NULL")) {
    const { data, error } = await supabase()
      .from("users")
      .update({ last_grant_on: params[0] })
      .eq("id", params[1])
      .or(`last_grant_on.is.null,last_grant_on.lt.${String(params[2])}`)
      .select("id");
    raise(error);
    return { changes: data?.length ?? 0, lastInsertRowid: 0 };
  }
  if (/ON CONFLICT/i.test(sql)) {
    const header = sql.match(/^INSERT INTO (\w+)\(([^)]+)\) VALUES\(([^)]+)\)/);
    const conflict = sql.match(/ON CONFLICT\((\w+)\)/);
    if (!header || !conflict) throw new Error(`Unsupported write: ${sql}`);
    const columns = splitCsv(header[2]);
    const values = valuesOf(header[3], params);
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    const { error } = await supabase().from(header[1]).upsert(row, { onConflict: conflict[1] });
    raise(error);
    return { changes: 1, lastInsertRowid: 0 };
  }
  if (sql.startsWith("INSERT INTO ")) {
    const header = sql.match(/^INSERT INTO (\w+)\(([^)]+)\) VALUES\((.+)\)$/);
    if (!header) throw new Error(`Unsupported write: ${sql}`);
    const columns = splitCsv(header[2]);
    const values = valuesOf(header[3], params);
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    const identity = ["users", "bets", "ledger", "category_history", "api_calls"].includes(header[1]);
    if (!identity) {
      const { error } = await supabase().from(header[1]).insert(row);
      raise(error);
      return { changes: 1, lastInsertRowid: 0 };
    }
    const { data, error } = await supabase().from(header[1]).insert(row).select("id").maybeSingle();
    raise(error);
    const id = (data as { id?: number | string } | null)?.id;
    return { changes: 1, lastInsertRowid: typeof id === "number" ? id : Number(id) || 0 };
  }
  if (sql.startsWith("UPDATE ")) {
    const header = sql.match(/^UPDATE (\w+) SET (.+) WHERE (.+)$/);
    if (!header) throw new Error(`Unsupported write: ${sql}`);
    const columns = splitCsv(header[2]).map((piece) => {
      const match = piece.match(/^(\w+)\s*=\s*(.+)$/);
      if (!match) throw new Error(`Unsupported assignment: ${piece}`);
      return [match[1], match[2]] as const;
    });
    const where = header[3];
    const whereParams = params.slice(columns.filter(([, value]) => value === "?").length);
    const setParams = params.slice(0, params.length - whereParams.length);
    let setIndex = 0;
    const patch: SqlRow = {};
    for (const [column, raw] of columns) {
      patch[column] = raw === "?" ? setParams[setIndex++] : valuesOf(raw, [])[0];
    }
    let query = supabase().from(header[1]).update(patch) as unknown as Filter;
    query = applyWhere(query, where, whereParams);
    const { data, error } = await query.select("id");
    raise(error);
    return { changes: Array.isArray(data) ? data.length : 0, lastInsertRowid: 0 };
  }
  if (sql.startsWith("DELETE FROM ")) {
    const header = sql.match(/^DELETE FROM (\w+) WHERE (.+)$/);
    if (!header) throw new Error(`Unsupported write: ${sql}`);
    let query = supabase().from(header[1]).delete() as unknown as Filter;
    query = applyWhere(query, header[2], params);
    const { data, error } = await query.select();
    raise(error);
    return { changes: Array.isArray(data) ? data.length : 0, lastInsertRowid: 0 };
  }
  throw new Error(`Unsupported write: ${sql}`);
}

export async function rows(sql: string, ...params: Param[]) {
  return selectRows(norm(sql), params.map(clean));
}

export async function one(sql: string, ...params: Param[]) {
  const found = await rows(sql, ...params);
  return found[0] ?? null;
}

export async function run(sql: string, ...params: Param[]) {
  return mutate(norm(sql), params.map(clean));
}

export async function metaGet(key: string) {
  const row = await one("SELECT value FROM meta WHERE key = ?", key);
  return row ? String(row.value) : null;
}

export async function metaSet(key: string, value: string) {
  await run(
    "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

export async function metaSetIfAbsent(key: string, value: string) {
  const { error } = await supabase().from("meta").insert({ key, value });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
}
