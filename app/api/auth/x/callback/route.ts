import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unseal, seal } from "@/lib/seal";
import { exchangeXCode, xCallbackUrl } from "@/lib/x";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (code: string, detail?: string) => {
    const target = new URL("/", url.origin);
    target.searchParams.set("x_error", code);
    if (detail) target.searchParams.set("x_detail", detail.slice(0, 140));
    return NextResponse.redirect(target);
  };
  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("state");
  const jar = await cookies();
  const pkce = unseal<{ verifier: string; state: string; exp: number }>(jar.get("aurasea_pkce")?.value);
  if (!pkce || pkce.state !== state || pkce.exp < Date.now()) return fail("state");
  try {
    const profile = await exchangeXCode({ code, verifier: pkce.verifier, redirectUri: xCallbackUrl(url.origin) });
    const response = NextResponse.redirect(new URL("/?x=linked", url.origin));
    response.cookies.set("aurasea_pkce", "", cookieOptions(0));
    response.cookies.set(
      "aurasea_x",
      seal({ ...profile, exp: Date.now() + 30 * 60 * 1000 }),
      cookieOptions(30 * 60),
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "token";
    console.error("x callback failed", message);
    return fail("token", message);
  }
}
