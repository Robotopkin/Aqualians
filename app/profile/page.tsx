"use client";

import { useEffect, useState } from "react";
import SeaBackground from "@/components/SeaBackground";
import SiteHeader from "@/components/SiteHeader";
import ScrollFrame from "@/components/ScrollFrame";
import { useSea } from "@/components/useSea";
import { formatAura } from "@/lib/format";
import type { LeaderboardBoard, ReferralRow, TideResult } from "@/lib/types";

export default function ProfilePage() {
  const { state, error, load } = useSea();
  const [games, setGames] = useState<TideResult[] | null>(null);
  const [note, setNote] = useState("");
  const [origin, setOrigin] = useState("");
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardBoard | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!state?.viewer) {
      setGames(null);
      setRows(null);
      setLeaderboard(null);
      return;
    }
    void fetch("/api/profile", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { games?: TideResult[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load the profile");
        setGames(body.games ?? []);
        setNote("");
      })
      .catch((err: unknown) => setNote(err instanceof Error ? err.message : "Could not load the profile"));
    void fetch("/api/referrals", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { code?: string; rows?: ReferralRow[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load referrals");
        setCode(body.code ?? "");
        setRows(body.rows ?? []);
      })
      .catch((err: unknown) => setNote(err instanceof Error ? err.message : "Could not load referrals"));
    void fetch("/api/leaderboard", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as LeaderboardBoard & { error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load leaderboard");
        setLeaderboard(body);
      })
      .catch((err: unknown) => setNote(err instanceof Error ? err.message : "Could not load leaderboard"));
  }, [state?.viewer]);

  const link = code && origin ? `${origin}/?ref=${code}` : "";

  return (
    <>
      <SeaBackground />
      <main className="page profile-page">
        <SiteHeader
          viewer={state?.viewer ?? null}
          referralRequired={Boolean(state?.referralRequired)}
          grant={state?.grant ?? null}
          onSession={() => void load()}
        />
        {error ? <div className="error">{error}</div> : null}
        {note ? <p className="error inline">{note}</p> : null}
        <section className="profile-grid">
          <div className="scroll-wrap">
            <ScrollFrame />
            <article className="card">
              <div className="profile-scroll">
                <div className="kicker">Profile</div>
                <h2>Your tides</h2>
                {!state?.viewer ? <p className="meta">Connect a wallet and sign in. Nothing here opens before that.</p> : null}
                {games && games.length === 0 ? <p className="meta">No stakes yet. The list grows in the order the tides open.</p> : null}
                <ol className="history">
                  {(games ?? []).map((game) => (
                    <li key={game.roundId}>
                      <div className="option-top">
                        <div>
                          <strong>{game.title}</strong>
                          <div className="meta">{game.question}</div>
                          <div className="meta">{new Date(game.startsAt).toISOString().slice(0, 16).replace("T", " ")} UTC</div>
                          <div className="profile-picks">
                            {game.picks.map((pick) => (
                              <span
                                key={pick.title}
                                className={`profile-pick${pick.won === true ? " won" : pick.won === false ? " lost" : ""}`}
                              >
                                {pick.title} <strong>{formatAura(pick.amount)}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                        {game.status === "open" ? <div className="phase">In the water</div> : null}
                        {game.status === "returned" ? <div className="phase">Stakes returned</div> : null}
                        {game.status === "won" || game.status === "lost" ? (
                          <div className="round-net">
                            {game.lost > 0 ? <span className="net-loss">−{formatAura(game.lost)} Aura</span> : null}
                            {game.profit > 0 ? <span className="net-profit">+{formatAura(game.profit)} Aura</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          </div>
          <div className="scroll-wrap">
            <ScrollFrame />
            <article className="card">
              <div className="profile-scroll">
                <div className="kicker">Profile</div>
                <h2>Referrals</h2>
                {!state?.viewer ? <p className="meta">Connect a wallet and sign in to see who followed your link.</p> : null}
                {state?.viewer ? (
                  <label className="field">
                    Invite link. You receive an extra 10% of each referral’s game profit.
                    <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                ) : null}
                {rows && rows.length === 0 ? <p className="meta">No referrals have earned Aura yet.</p> : null}
                {rows && rows.length > 0 ? (
                  <ul className="history">
                    {rows.map((row) => (
                      <li key={row.xHandle}>
                        <div className="option-top">
                          <div>
                            <strong>@{row.xHandle}</strong>
                            <div className="meta">Joined {row.joinedAt.slice(0, 10)}</div>
                          </div>
                          <div className="net-profit">+{formatAura(row.earned)} Aura</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          </div>
          <div className="scroll-wrap">
            <ScrollFrame />
            <article className="card">
              <div className="profile-scroll">
                <div className="kicker">Profile</div>
                <h2>Leaderboard</h2>
                {leaderboard ? (
                  <>
                    <p className="leaderboard-rank">
                      Your current place <strong>#{leaderboard.currentRank}</strong>
                    </p>
                    <p className="meta">
                      Top 50 · updated {new Date(leaderboard.refreshedAt).toISOString().slice(11, 16)} UTC
                    </p>
                    <ol className="history leaderboard-list">
                      {leaderboard.rows.map((entry) => (
                        <li key={entry.xHandle} className={entry.viewer ? "viewer" : undefined}>
                          <span className="leaderboard-position">#{entry.rank}</span>
                          <span className="leaderboard-handle">@{entry.xHandle}</span>
                          <span className="leaderboard-aura">{formatAura(entry.aura)} Aura</span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p className="meta">The leaderboard appears after sign in.</p>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
