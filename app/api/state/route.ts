import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicState } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const state = await publicState(jar.get("aurasea")?.value ?? null);
  return NextResponse.json(state);
}
