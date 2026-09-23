import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unseal } from "@/lib/seal";
import { xConfig } from "@/lib/x";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const link = await unseal<{ id: string; username: string; exp: number }>(jar.get("aurasea_x")?.value);
  const fresh = link && link.exp > Date.now() && link.username ? link : null;
  return NextResponse.json({
    configured: xConfig().configured,
    handle: fresh?.username ?? null,
  });
}
