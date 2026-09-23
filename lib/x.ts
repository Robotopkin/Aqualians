import { createHash, randomBytes } from "crypto";

export type XProfile = { id: string; username: string; followers: number | null };

export function xConfig() {
  const clientId = process.env.X_CLIENT_ID?.trim() || process.env.TWITTER_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.X_CLIENT_SECRET?.trim() || process.env.TWITTER_CLIENT_SECRET?.trim() || "";
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

export function xCallbackUrl(origin: string) {
  return process.env.X_CALLBACK_URL?.trim() || `${origin}/api/auth/x/callback`;
}

export function xPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

export function xAuthorizeUrl(input: { redirectUri: string; state: string; challenge: string }) {
  const { clientId } = xConfig();
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return `${url.toString()}&scope=${encodeURIComponent("tweet.read users.read")}`;
}

export async function exchangeXCode(input: { code: string; verifier: string; redirectUri: string }): Promise<XProfile> {
  const { clientId, clientSecret, configured } = xConfig();
  if (!configured) throw new Error("X is not configured");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  });
  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    throw new Error(detail.slice(0, 180) || "X did not accept the login");
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("X did not accept the login");
  const profile = await fetchXProfile(token.access_token);
  return profile;
}

async function fetchXProfile(accessToken: string): Promise<XProfile> {
  let url = "https://api.x.com/2/users/me?user.fields=public_metrics";
  let last = "X did not return a profile";
  for (let attempt = 0; attempt < 3; attempt++) {
    const meRes = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (meRes.status >= 300 && meRes.status < 400) {
      const next = meRes.headers.get("location");
      if (!next) break;
      url = new URL(next, url).toString();
      continue;
    }
    const text = await meRes.text();
    if (!meRes.ok) {
      last = text.slice(0, 160) || `X profile ${meRes.status}`;
      if (url.includes("user.fields")) {
        url = "https://api.x.com/2/users/me";
        continue;
      }
      throw new Error(last);
    }
    const me = JSON.parse(text) as {
      data?: { id?: string; username?: string; public_metrics?: { followers_count?: number } };
    };
    const id = me.data?.id;
    const username = me.data?.username?.toLowerCase();
    if (!id || !username) throw new Error(text.slice(0, 160) || "X did not return a profile");
    const followers = me.data?.public_metrics?.followers_count;
    return { id, username, followers: typeof followers === "number" ? followers : null };
  }
  throw new Error(last);
}

export async function lookupX(handle: string): Promise<{ followers: number | null; missing: boolean }> {
  const token = process.env.TWITTER_BEARER_TOKEN?.trim();
  if (!token) return { followers: null, missing: false };
  try {
    const response = await fetch(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
    );
    if (response.status === 404) return { followers: null, missing: true };
    if (!response.ok) return { followers: null, missing: false };
    const json = (await response.json()) as { data?: { public_metrics?: { followers_count?: number } } };
    const followers = json.data?.public_metrics?.followers_count;
    return { followers: typeof followers === "number" ? followers : null, missing: false };
  } catch {
    return { followers: null, missing: false };
  }
}
