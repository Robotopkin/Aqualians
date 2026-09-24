"use client";

import { useEffect, useRef, useState } from "react";
import { getAddress } from "viem";
import { placeLabel } from "@/lib/categories";
import { formatAura } from "@/lib/format";
import { betMessage } from "@/lib/messages";
import type { BetLine, CategoryId, Mode, PublicCategory, PublicRound } from "@/lib/types";
import SeaBackground from "./SeaBackground";
import SiteHeader from "./SiteHeader";
import ScrollFrame from "./ScrollFrame";
import TideNum from "./TideNum";
import TideLoader from "./TideLoader";
import { useSea } from "./useSea";
import { signWallet } from "./wallet";

const MODE_NAME: Record<Mode, string> = {
  growth: "Growth",
  movement: "Movement",
};
const ROLL_MS = 2600;

function shownRounds(rounds: PublicRound[], now: number) {
  const picked = new Map<PublicRound["kind"], PublicRound>();
  for (const round of rounds) {
    const current = picked.get(round.kind);
    const live = round.startsAt <= now && now < round.endsAt;
    const currentLive = current != null && current.startsAt <= now && now < current.endsAt;
    if (!current || (live && !currentLive) || (!live && !currentLive && round.startsAt > current.startsAt)) {
      picked.set(round.kind, round);
    }
  }
  return [...picked.values()].sort((a, b) => (a.kind === b.kind ? a.startsAt - b.startsAt : a.kind === "volume" ? -1 : 1));
}

function formatPct(n: number | null) {
  if (n == null) return "—";
  const pct = n * 100;
  const digits = Math.abs(pct) >= 10 ? 1 : 2;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

function formatRemain(ms: number, fast: boolean) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (fast && seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
}

export default function Game() {
  const { state, serverNow, error, setError, load, ready } = useSea();
  const [busy, setBusy] = useState(false);
  const [slips, setSlips] = useState<Record<string, Record<string, { amount: string; rank: number }>>>({});

  useEffect(() => {
    if (!state) return;
    setSlips((prev) => {
      const next = { ...prev };
      for (const round of state.rounds) {
        if (next[round.id]) continue;
        const slip: Record<string, { amount: string; rank: number }> = {};
        for (const category of round.categories) {
          slip[category.id] = { amount: "", rank: round.place };
        }
        next[round.id] = slip;
      }
      return next;
    });
  }, [state]);

  async function cast(round: PublicRound) {
    if (!state?.viewer) return;
    setError("");
    setBusy(true);
    try {
      const slip = slips[round.id] ?? {};
      const lines: BetLine[] = round.categories
        .map((category) => ({
          category: category.id,
          rank: round.place,
          amount: Number.parseInt(slip[category.id]?.amount || "0", 10) || 0,
        }))
        .filter((line) => line.amount > 0);
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      const nonceJson = (await nonceRes.json()) as { nonce: string };
      const address = getAddress(state.viewer.address);
      const message = betMessage({ address, roundId: round.id, lines, nonce: nonceJson.nonce });
      const signature = await signWallet(message, address);
      const response = await fetch("/api/bet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roundId: round.id, lines, signature, nonce: nonceJson.nonce }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Bet was rejected");
      setSlips((prev) => {
        const slip: Record<string, { amount: string; rank: number }> = {};
        for (const category of round.categories) slip[category.id] = { amount: "", rank: round.place };
        return { ...prev, [round.id]: slip };
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bet was rejected");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SeaBackground />
      {ready ? null : <TideLoader />}
      <main className="page">
        <SiteHeader
          viewer={state?.viewer ?? null}
          referralRequired={Boolean(state?.referralRequired)}
          grant={state?.grant ?? null}
          onSession={() => void load()}
        />

        {error ? <div className="error">{error}</div> : null}

        <section className="rounds">
          {shownRounds(state?.rounds ?? [], serverNow).map((round) => (
            <RoundCard
              key={round.kind}
              onExpire={load}
              round={round}
              now={serverNow}
              aura={state?.viewer?.aura ?? 0}
              signedIn={Boolean(state?.viewer)}
              slip={slips[round.id] ?? {}}
              busy={busy}
              onSlip={(category, patch) =>
                setSlips((prev) => {
                  const current = prev[round.id]?.[category] ?? { amount: "", rank: 1 };
                  return {
                    ...prev,
                    [round.id]: {
                      ...prev[round.id],
                      [category]: { ...current, ...patch },
                    },
                  };
                })
              }
              onCast={() => void cast(round)}
            />
          ))}
          {ready && !state ? (
            <div className="scroll-wrap">
              <ScrollFrame />
              <article className="card">The tide is quiet. Refresh in a moment.</article>
            </div>
          ) : null}
        </section>

        <details className="rules">
          <summary>How a round works</summary>
          <p>
            {state?.rounds.some((round) => round.endsAt - round.startsAt < 60 * 60 * 1000)
              ? "Test clock: each tide lasts 5 minutes and settles on a simulated result. Bets are open for the first half. Aura is granted once each UTC day."
              : "Whale Hunt compares volume. It opens 00:00–12:00 UTC and settles at the next 00:00. Shrimp Gather compares transaction count. It opens 12:00–00:00 UTC and settles at 12:00. Each round compares its opening result with its closing result."}
          </p>
          <ul>
            <li>Growth ranks the biggest gain as 1st. If every category is down, 1st is the smallest drop. The round asks which category takes one place, 1st through 4th.</li>
            <li>Movement ranks the largest absolute percent as 1st, up or down. The smallest move is 4th. The round asks for one place the same way.</li>
            <li className="role-rule">
              <img src="/roles/shrimp.png" alt="" className="role-icon" />
              <span>Shrimp see how other shrimp split their stakes.</span>
            </li>
            <li className="role-rule">
              <img src="/roles/dolphin.png" alt="" className="role-icon" />
              <span>Dolphin sees yesterday’s result for these categories.</span>
            </li>
            <li className="role-rule">
              <img src="/roles/shark.png" alt="" className="role-icon" />
              <span>Shark winning stakes count as 5% heavier.</span>
            </li>
            <li className="role-rule">
              <img src="/roles/whale.png" alt="" className="role-icon" />
              <span>The option whales backed most is lit for everyone.</span>
            </li>
          </ul>
        </details>
      </main>
    </>
  );
}

function RoleMark({ category }: { category: PublicCategory }) {
  if (category.shrimpShare != null) {
    return (
      <div className="role-mark">
        <span>{Math.round(category.shrimpShare * 100)}%</span>
        <img src="/roles/shrimp.png" alt="" className="role-icon" />
      </div>
    );
  }
  if (category.yesterday) {
    return (
      <div className="role-mark">
        <span>
          {formatPct(category.yesterday.changePct)} · {placeLabel(category.yesterday.rank)}
        </span>
        <img src="/roles/dolphin.png" alt="" className="role-icon" />
      </div>
    );
  }
  return <div className="role-mark" />;
}

function RoundCard({
  round,
  now,
  aura,
  signedIn,
  slip,
  busy,
  onSlip,
  onCast,
  onExpire,
}: {
  round: PublicRound;
  now: number;
  aura: number;
  signedIn: boolean;
  slip: Record<string, { amount: string; rank: number }>;
  busy: boolean;
  onSlip: (category: CategoryId, patch: Partial<{ amount: string; rank: number }>) => void;
  onCast: () => void;
  onExpire: () => void;
}) {
  const [shown, setShown] = useState(round);
  const [shut, setShut] = useState(false);
  const tripped = useRef(false);
  useEffect(() => {
    const due = shown.phase === "betting" ? shown.betsCloseAt : shown.endsAt;
    if (now < due || tripped.current) return;
    tripped.current = true;
    setShut(true);
    onExpire();
  }, [now, shown, onExpire]);
  useEffect(() => {
    if (round.id === shown.id && round.phase === shown.phase) {
      setShown(round);
      return;
    }
    setShut(true);
    const timer = window.setTimeout(() => {
      tripped.current = false;
      setShown(round);
      setShut(false);
    }, ROLL_MS);
    return () => window.clearTimeout(timer);
  }, [round, shown.id, shown.phase]);
  const view = shown;
  const target = view.phase === "betting" ? view.betsCloseAt : view.endsAt;
  const stake = view.categories.reduce((sum, category) => sum + (Number.parseInt(slip[category.id]?.amount || "0", 10) || 0), 0);
  const free = Math.floor(aura);
  const canBet = view.phase === "betting" && signedIn && !shut && view.id === round.id;
  return (
    <div className={`scroll-wrap${shut ? " shut" : ""}`}>
      <div className="scroll-stage">
        <ScrollFrame />
      </div>
      <article className="card">
      <div className="card-head">
        <div>
          <div className="kicker">
            {view.kind === "volume" ? "Volume" : "Transaction count"} · {MODE_NAME[view.mode]} · {placeLabel(view.place)} place
            {" · "}
            <span className={view.phase === "betting" ? "tide-open" : "tide-closed"}>
              {view.phase === "betting" ? "open" : "closed"}
            </span>
          </div>
          <h2>{view.title}</h2>
          <p className="question">{view.question}</p>
          <p className="meta">
            Pool {formatAura(view.poolTotal)} Aura · {view.betCount} bets in the water
            {view.late ? " · the opening print was late because the server was down" : ""}
            {view.shrimpVeil
              ? ` · shrimp bets: ${view.shrimpVeil.bets}${view.shrimpVeil.veiled ? ", still an even 25%" : ""}`
              : ""}
          </p>
        </div>
        <div className="round-status">
          <div className="count">{formatRemain(target - now, view.endsAt - view.startsAt < 60 * 60 * 1000)}</div>
        </div>
      </div>
      <div className="options">
        {view.categories.map((category) => {
          const committed = view.myBets.find((bet) => bet.category === category.id)?.amount ?? 0;
          return (
            <div key={category.id} className={`option${category.whale ? " whale" : ""}`}>
              <div className="option-head">
                <div className="whale-title-wrap">
                  <h3 className={category.whale ? "whale-name" : undefined}>{category.title}</h3>
                  {category.whale ? (
                    <div className="whale-tip">
                      <img src="/roles/whale.png" alt="" className="role-icon" />
                      <span>Whales have staked the most Aura on this category. A tie goes to more unique whales.</span>
                    </div>
                  ) : null}
                </div>
                <RoleMark category={category} />
              </div>
              <div className="staked-label">Aura staked</div>
              <TideNum value={formatAura(committed)} small />
              <label className="field stake-field">
                How much Aura to stake
                <input
                  className="stake-input"
                  inputMode="numeric"
                  maxLength={10}
                  disabled={!canBet}
                  value={slip[category.id]?.amount ?? ""}
                  placeholder="0"
                  onChange={(e) => onSlip(category.id, { amount: e.target.value.replace(/[^\d]/g, "").slice(0, 10), rank: view.place })}
                />
              </label>
            </div>
          );
        })}
      </div>
      <p className="meta total-staked">Total staked {formatAura(view.poolTotal)} Aura</p>
      <div className="actions">
        <span className="meta">
          staking {formatAura(stake)} · free {formatAura(free)}
          {stake > free ? " · not enough Aura" : ""}
        </span>
        <button className="solid" disabled={!canBet || busy || stake < 1 || stake > free} onClick={onCast}>
          {busy ? "Signing…" : "Sign bet"}
        </button>
      </div>
      </article>
    </div>
  );
}
