import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { gamesFor } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jar = await cookies();
    const games = await gamesFor(jar.get("aurasea")?.value ?? "");
    if (!games) return NextResponse.json({ error: "Enter the sea first" }, { status: 401 });
    return NextResponse.json({ games });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The sea did not respond";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
