import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { leaderboardFor } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const board = leaderboardFor(jar.get("aurasea")?.value ?? "");
  if (!board) return NextResponse.json({ error: "Enter the sea first" }, { status: 401 });
  return NextResponse.json(board);
}
