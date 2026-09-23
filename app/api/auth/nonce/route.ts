import { NextResponse } from "next/server";
import { createNonce } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const nonce = await createNonce();
  return NextResponse.json({ nonce });
}
