"use client";

import { useEffect, useState } from "react";
import SeaBackground from "@/components/SeaBackground";
import SiteHeader from "@/components/SiteHeader";
import ScrollFrame from "@/components/ScrollFrame";
import TideLoader from "@/components/TideLoader";
import { useSea } from "@/components/useSea";
import { formatAura } from "@/lib/format";
import type { LeaderboardBoard, ReferralRow, TideResult } from "@/lib/types";

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text) throw new Error("The sea did not respond");
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error("The sea did not respond");
  }
}

export default function ProfilePage() {
  const { state, error, load, ready } = useSea();
  const [games, setGames] = useState<TideResult[] | null>(null);
  const [note, setNote] = useState("");
  const [origin, setOrigin] = useState("");
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardBoard | null>(null);
  const [panelsReady, setPanelsReady] = useState(false);
  const viewerKey = state?.viewer?.address ?? "";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!viewerKey) {
      setGames(null);
      setRows(null);
      setLeaderboard(null);
      setPanelsReady(true);
      return;
    }
    let gone = false;
    setPanelsReady(false);
    const notes: string[] = [];
    const remember = (err: unknown) => {
      notes.push(err instanceof Error ? err.message : "Could not load the profile");
    };
    void Promise.all([
      fetch("/api/profile", { cache: "no-store" })
        .then(async (response) => {
          const body = await readJson<{ games?: TideResult[] }>(response);
          if (!response.ok) throw new Error(body.error || "Could not load the profile");
          return body.games ?? [];
        })
        .then((nextGames) => {
          if (!gone) setGames(nextGames);
        })
        .catch((err: unknown) => {
          remember(err);
          if (!gone) setGames([]);
        }),
      fetch("/api/referrals", { cache: "no-store" })
        .then(async (response) => {
          const body = await readJson<{ rows?: ReferralRow[] }>(response);
          if (!response.ok) throw new Error(body.error || "Could not load referrals");
          return body.rows ?? [];
        })
        .then((nextRows) => {
          if (!gone) setRows(nextRows);
        })
        .catch((err: unknown) => {
          remember(err);
          if (!gone) setRows([]);
        }),
      fetch("/api/leaderboard", { cache: "no-store" })
        .then(async (response) => {
          const body = await readJson<LeaderboardBoard>(response);
          if (!response.ok) throw new Error(body.error || "Could not load leaderboard");
          return body;
        })
        .then((nextBoard) => {
          if (!gone) setLeaderboard(nextBoard);
        })
        .catch(remember),
    ]).finally(() => {
      if (gone) return;
      setNote(notes[0] ?? "");
      setPanelsReady(true);
    });
    return () => {
      gone = true;
    };
  }, [ready, viewerKey]);

  const link = state?.viewer && origin ? `${origin}/?ref=${state.viewer.referralCode}` : "";

  return (
    <>
      <SeaBackground />
      {ready && (!state?.viewer || panelsReady) ? null : <TideLoader />}
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
                          <div className="meta">You staked {formatAura(game.stake)} Aura · pool {formatAura(game.pool)} Aura</div>
                          <div className="profile-picks">
                            {game.picks.map((pick) => (
                              <span
                                key={pick.title}
                                className={`profile-pick${pick.amount > 0 && pick.won === true ? " won" : pick.amount > 0 && pick.won === false ? " lost" : ""}`}
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
                            {game.profit - game.lost > 0 ? (
                              <span className="net-profit">+{formatAura(game.profit - game.lost)} Aura</span>
                            ) : game.profit - game.lost < 0 ? (
                              <span className="net-loss">−{formatAura(game.lost - game.profit)} Aura</span>
                            ) : (
                              <span className="meta">0 Aura</span>
                            )}
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
                {rows && rows.length === 0 ? <p className="meta">Nobody has entered with your link yet.</p> : null}
                {rows && rows.length > 0 ? (
                  <ul className="history">
                    {rows.map((row) => (
                      <li key={row.xHandle}>
                        <div className="option-top">
                          <div>
                            <div className="person">
                              <img src={`/roles/${row.role}.png`} alt="" className="role-icon" />
                              <strong>{row.xHandle}</strong>
                            </div>
                            <div className="meta">Joined {row.joinedAt.slice(0, 10)}</div>
                          </div>
                          {row.earned > 0 ? (
                            <div className="net-profit">+{formatAura(row.earned)} Aura</div>
                          ) : (
                            <div className="meta">No profit yet</div>
                          )}
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
                          <span className="leaderboard-handle">
                            <img src={`/roles/${entry.role}.png`} alt="" className="role-icon" />
                            <span>{entry.xHandle}</span>
                          </span>
                          <span className="leaderboard-aura">{formatAura(entry.aura)} Aura</span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p className="meta">
                    {state?.viewer ? "The leaderboard is still settling." : "The leaderboard appears after sign in."}
                  </p>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
