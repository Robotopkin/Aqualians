import { NextResponse } from "next/server";
import { walletKnown } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  return NextResponse.json({ known: await walletKnown(address) });
}
