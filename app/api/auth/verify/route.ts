import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { enterSea } from "@/lib/engine";
import { unseal } from "@/lib/seal";
import { normalizeHandle } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: string;
      xHandle?: string;
      signature?: string;
      nonce?: string;
      referral?: string;
    };
    if (!body.address || !body.xHandle || !body.signature || !body.nonce) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const jar = await cookies();
    const link = unseal<{ id: string; username: string; followers: number | null; exp: number }>(jar.get("aurasea_x")?.value);
    if (!link || link.exp < Date.now() || !link.username || !link.id) {
      return NextResponse.json({ error: "Connect X first" }, { status: 400 });
    }
    if (normalizeHandle(body.xHandle) !== link.username) {
      return NextResponse.json({ error: "X profile does not match the connected account" }, { status: 400 });
    }
    const result = await enterSea({
      address: body.address,
      xHandle: link.username,
      xUserId: link.id,
      followers: link.followers ?? null,
      signature: body.signature as `0x${string}`,
      nonce: body.nonce,
      referral: body.referral ?? "",
    });
    jar.set("aurasea", result.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    return NextResponse.json({
      created: result.created,
      role: result.role,
      grant: result.grant,
      day: result.day,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not enter";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
