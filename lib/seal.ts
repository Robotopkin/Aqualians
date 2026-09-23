import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { metaGet, metaSetIfAbsent } from "./db";

let cached: string | null = process.env.SESSION_SECRET?.trim() || null;

export async function ensureSecret() {
  if (cached) return cached;
  const existing = await metaGet("cookie_secret");
  if (existing) {
    cached = existing;
    return cached;
  }
  const created = randomBytes(32).toString("hex");
  await metaSetIfAbsent("cookie_secret", created);
  cached = (await metaGet("cookie_secret")) || created;
  return cached;
}

export async function seal(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", await ensureSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export async function unseal<T>(token: string | undefined | null): Promise<T | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", await ensureSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
