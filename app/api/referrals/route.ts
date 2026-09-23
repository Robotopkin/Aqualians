import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { referralsFor } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const board = referralsFor(jar.get("aurasea")?.value ?? "");
  if (!board) return NextResponse.json({ error: "Enter the sea first" }, { status: 401 });
  return NextResponse.json(board);
}
