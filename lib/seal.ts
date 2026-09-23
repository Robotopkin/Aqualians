import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { metaGet, metaSet } from "./db";

function secret() {
  const env = process.env.SESSION_SECRET?.trim();
  if (env) return env;
  const existing = metaGet("cookie_secret");
  if (existing) return existing;
  const created = randomBytes(32).toString("hex");
  metaSet("cookie_secret", created);
  return created;
}

export function seal(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function unseal<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
