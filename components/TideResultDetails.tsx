"use client";

import { placeLabel } from "@/lib/categories";
import { formatAura } from "@/lib/format";
import type { TideResult } from "@/lib/types";

function formatChange(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const percent = value * 100;
  const digits = Math.abs(percent) >= 10 ? 1 : 2;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(digits)}%`;
}

export function TideResultPicks({ game }: { game: TideResult }) {
  const finished = game.status !== "open";
  return (
    <div className="profile-picks">
      {game.picks.map((pick) => {
        const change = finished ? pick.changePct : null;
        const changeClass = change == null || !Number.isFinite(change) ? "" : change > 0 ? " up" : change < 0 ? " down" : "";
        return (
          <div className="profile-pick" key={pick.category}>
            <div className={`profile-pick-rank${pick.won === true ? " winning" : ""}`}>
              {finished && pick.rank != null ? `${placeLabel(pick.rank)} place` : "—"}
            </div>
            <div className="profile-pick-main">
              <strong>{pick.title}</strong>
              <span className={`profile-pick-change${changeClass}`}>{finished ? formatChange(change) : "—"}</span>
            </div>
            <div className="profile-pick-stake">Staked {formatAura(pick.amount)} Aura</div>
          </div>
        );
      })}
    </div>
  );
}

export function TideNet({ game }: { game: TideResult }) {
  if (game.status === "open") return null;
  if (game.status === "returned") return <span className="phase">Stakes returned</span>;
  if (game.status === "won" && game.profit > 0) {
    return <span className="net-profit">+{formatAura(game.profit)} Aura</span>;
  }
  if (game.status === "lost") {
    return <span className="net-loss">−{formatAura(game.lost || game.stake)} Aura</span>;
  }
  return <span className="meta">0 Aura</span>;
}
