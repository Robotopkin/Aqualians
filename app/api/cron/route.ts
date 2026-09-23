import { NextResponse } from "next/server";
import { runTick } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "forbidden" }, { status: 401 });
    }
  }
  await runTick();
  return NextResponse.json({ ok: true, now: Date.now() });
}
