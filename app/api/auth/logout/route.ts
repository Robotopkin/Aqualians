import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logout } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  const token = jar.get("aurasea")?.value;
  if (token) await logout(token);
  jar.set("aurasea", "", { httpOnly: true, path: "/", maxAge: 0 });
  jar.set("aurasea_x", "", { httpOnly: true, path: "/", maxAge: 0 });
  jar.set("aurasea_pkce", "", { httpOnly: true, path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
