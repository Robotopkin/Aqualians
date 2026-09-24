import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { pendingTide, publicState } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jar = await cookies();
    const state = await publicState(jar.get("aurasea")?.value ?? null);
    const tide = pendingTide();
    if (tide) after(() => tide);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The sea did not respond";
    console.error("state failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
