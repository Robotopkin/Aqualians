import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { placeBets } from "@/lib/engine";
import type { BetLine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const jar = await cookies();
    const token = jar.get("aurasea")?.value;
    if (!token) return NextResponse.json({ error: "Enter the sea first" }, { status: 401 });
    const body = (await request.json()) as {
      roundId?: string;
      lines?: BetLine[];
      signature?: string;
      nonce?: string;
    };
    if (!body.roundId || !body.signature || !body.nonce || !Array.isArray(body.lines)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    await placeBets({
      token,
      roundId: body.roundId,
      lines: body.lines,
      signature: body.signature as `0x${string}`,
      nonce: body.nonce,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bet was rejected";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
