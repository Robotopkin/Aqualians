import { NextResponse } from "next/server";
import { seal } from "@/lib/seal";
import { xAuthorizeUrl, xCallbackUrl, xConfig, xPkce } from "@/lib/x";

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
  const origin = new URL(request.url).origin;
  if (!xConfig().configured) {
    return NextResponse.redirect(new URL("/?x_error=missing", origin));
  }
  const pkce = xPkce();
  const response = NextResponse.redirect(
    xAuthorizeUrl({
      redirectUri: xCallbackUrl(origin),
      state: pkce.state,
      challenge: pkce.challenge,
    }),
  );
  response.cookies.set(
    "aurasea_pkce",
    seal({ verifier: pkce.verifier, state: pkce.state, exp: Date.now() + 10 * 60 * 1000 }),
    cookieOptions(600),
  );
  return response;
}
