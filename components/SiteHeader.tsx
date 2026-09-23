"use client";

import Link from "next/link";
import { compactAura } from "@/lib/format";
import type { PublicViewer } from "@/lib/types";
import AccountBar from "./AccountBar";

export default function SiteHeader({
  viewer,
  referralRequired,
  grant,
  onSession,
}: {
  viewer: PublicViewer | null;
  referralRequired: boolean;
  grant: { amount: number; day: string } | null;
  onSession: () => void;
}) {
  return (
    <header className="top">
      <div className="brand">
        <Link href="/" className="title-link">
          <h1>Aqualians</h1>
        </Link>
        <div className="eyebrow">AuraSea</div>
      </div>
      <div className="head-side">
        <AccountBar viewer={viewer} referralRequired={referralRequired} grant={grant} onSession={onSession} />
        <div className="player-aura">Aura {viewer ? compactAura(viewer.aura) : "—"}</div>
      </div>
    </header>
  );
}
