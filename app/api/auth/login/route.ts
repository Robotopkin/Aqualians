import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loginSea } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string; signature?: string; nonce?: string };
    if (!body.address || !body.signature || !body.nonce) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const result = await loginSea({
      address: body.address,
      signature: body.signature as `0x${string}`,
      nonce: body.nonce,
    });
    const jar = await cookies();
    jar.set("aurasea", result.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    return NextResponse.json({ ok: true, grant: result.grant, day: result.day, role: result.role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sign in";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
