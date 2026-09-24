"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getAddress } from "viem";
import { formatAura } from "@/lib/format";
import { loginMessage, registerMessage } from "@/lib/messages";
import type { PublicViewer, Role, TideResult } from "@/lib/types";
import ScrollFrame from "./ScrollFrame";
import TideNum from "./TideNum";
import { TideNet, TideResultPicks } from "./TideResultDetails";
import { connectWallet, disconnectWallet, signWallet, silentWallet, walletProvider } from "./wallet";

const ROLE_NAME: Record<Role, string> = {
  shrimp: "Shrimp",
  dolphin: "Dolphin",
  shark: "Shark",
  whale: "Whale",
};

const ROLE_COPY: Record<Role, string> = {
  shrimp: "You see how other shrimp split their stakes. Until ten of those bets are in, the split stays even.",
  dolphin: "You see yesterday’s result on these categories.",
  shark: "When you win, your stake is counted a little heavier as the pool is shared.",
  whale: "The category whales back most is shown in blue.",
};

const X_ERROR: Record<string, string> = {
  missing: "X login is not configured yet. Add X_CLIENT_ID and X_CLIENT_SECRET to .env.local, then restart.",
  denied: "X authorization was cancelled.",
  state: "X connection expired. Try Connect X again.",
  token: "X accepted the login, but did not return a profile.",
};

type Gift = { amount: number; day: string };
type Reveal = { role: Role; amount: number; day: string };

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function markGrantSeen(day: string) {
  sessionStorage.setItem("aurasea_grant_seen", day);
}

export default function AccountBar({
  viewer,
  referralRequired,
  grant,
  onSession,
}: {
  viewer: PublicViewer | null;
  referralRequired: boolean;
  grant: Gift | null;
  onSession: () => void;
}) {
  const [wallet, setWallet] = useState<`0x${string}` | null>(null);
  const [known, setKnown] = useState(false);
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [xConfigured, setXConfigured] = useState(true);
  const [referral, setReferral] = useState("");
  const [refLocked, setRefLocked] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepOpen, setStepOpen] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [gift, setGift] = useState<Gift | null>(null);
  const [result, setResult] = useState<TideResult | null>(null);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("x_error");
    const detail = params.get("x_detail");
    if (code) setError(detail || X_ERROR[code] || "Could not connect X");
    const ref = params.get("ref");
    if (ref) {
      sessionStorage.setItem("aurasea_ref", ref);
      setReferral(ref);
      setRefLocked(true);
    } else {
      const saved = sessionStorage.getItem("aurasea_ref");
      if (saved) {
        setReferral(saved);
        setRefLocked(true);
      } else {
        const draft = sessionStorage.getItem("aurasea_ref_draft");
        if (draft) setReferral(draft);
      }
    }
    if (code || params.get("x") === "linked") setStepOpen(true);
    if (code || params.get("x")) {
      params.delete("x_error");
      params.delete("x_detail");
      params.delete("x");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    void fetch("/api/auth/x", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { handle?: string | null; configured?: boolean }) => {
        setXHandle(body.handle ?? null);
        setXConfigured(body.configured !== false);
      })
      .catch(() => undefined);
    void silentWallet().then((address) => {
      if (address) setWallet(address);
    });
  }, []);

  useEffect(() => {
    if (refLocked || !referral) return;
    sessionStorage.setItem("aurasea_ref_draft", referral);
  }, [referral, refLocked]);

  useEffect(() => {
    if (!wallet) {
      setKnown(false);
      return;
    }
    const current = wallet;
    void fetch(`/api/auth/known?address=${current}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { known?: boolean }) => {
        if (wallet === current) setKnown(Boolean(body.known));
      })
      .catch(() => undefined);
  }, [wallet, viewer]);

  useEffect(() => {
    const ethereum = walletProvider();
    if (!ethereum?.on) return;
    const onAccounts = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? accounts : [];
      const next = typeof list[0] === "string" ? getAddress(list[0]) : null;
      setWallet(next);
      if (viewer && (!next || getAddress(viewer.address) !== next)) {
        void fetch("/api/auth/logout", { method: "POST" }).then(() => onSession());
      }
    };
    ethereum.on("accountsChanged", onAccounts);
    return () => ethereum.removeListener?.("accountsChanged", onAccounts);
  }, [viewer, onSession]);

  useEffect(() => {
    if (!grant) return;
    if (sessionStorage.getItem("aurasea_grant_seen") === grant.day) return;
    setGift(grant);
  }, [grant]);

  useEffect(() => {
    if (!viewer) {
      setResult(null);
      return;
    }
    let gone = false;
    const check = async () => {
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const body = (await response.json()) as { games?: TideResult[] };
        if (!response.ok || !Array.isArray(body.games)) return;
        const latest = body.games.reduce<TideResult | null>((current, game) => {
          if (game.status === "open") return current;
          return !current || game.startsAt > current.startsAt ? game : current;
        }, null);
        const seenKey = `aurasea_result_seen:${viewer.address.toLowerCase()}`;
        if (!latest || localStorage.getItem(seenKey) === latest.roundId) return;
        if (!gone) setResult(latest);
      } catch {
        /* The regular profile view can retry this notification later. */
      }
    };
    void check();
    const poll = setInterval(() => void check(), 10_000);
    return () => {
      gone = true;
      clearInterval(poll);
    };
  }, [viewer?.address]);

  async function connect() {
    setError("");
    setBusy(true);
    try {
      setWallet(await connectWallet());
      setStepOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect the wallet");
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (!wallet) return;
    setError("");
    setBusy(true);
    try {
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      const nonceJson = (await nonceRes.json()) as { nonce: string };
      const message = loginMessage({ address: wallet, nonce: nonceJson.nonce });
      const signature = await signWallet(message, wallet);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: wallet, signature, nonce: nonceJson.nonce }),
      });
      const body = (await response.json()) as { error?: string; grant?: number | null; day?: string };
      if (!response.ok) throw new Error(body.error || "Could not sign in");
      setStepOpen(false);
      if (body.grant && body.day) setGift({ amount: body.grant, day: body.day });
      onSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!wallet || !xHandle) return;
    setError("");
    setBusy(true);
    try {
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      const nonceJson = (await nonceRes.json()) as { nonce: string };
      const code = referral.trim().toLowerCase();
      const message = registerMessage({ address: wallet, xHandle, referral: code, nonce: nonceJson.nonce });
      const signature = await signWallet(message, wallet);
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: wallet, xHandle, signature, nonce: nonceJson.nonce, referral: code }),
      });
      const body = (await response.json()) as {
        error?: string;
        created?: boolean;
        role?: Role;
        grant?: number | null;
        day?: string;
      };
      if (!response.ok) throw new Error(body.error || "Could not enter");
      onSession();
      if (body.created && body.role && body.day) {
        markGrantSeen(body.day);
        setReveal({ role: body.role, amount: body.grant ?? 0, day: body.day });
        setStepOpen(true);
      } else {
        setStepOpen(false);
        if (body.grant && body.day) setGift({ amount: body.grant, day: body.day });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enter");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await fetch("/api/auth/logout", { method: "POST" });
    await disconnectWallet();
    setWallet(null);
    setOpen(false);
    onSession();
  }

  function dismissGift() {
    if (gift) markGrantSeen(gift.day);
    setGift(null);
  }

  function closeReveal() {
    if (reveal) markGrantSeen(reveal.day);
    setReveal(null);
    setStepOpen(false);
  }

  function dismissResult() {
    if (result && viewer) {
      localStorage.setItem(`aurasea_result_seen:${viewer.address.toLowerCase()}`, result.roundId);
    }
    setResult(null);
  }

  const label = !wallet ? "Connect Wallet" : viewer ? viewer.xHandle : short(wallet);

  const enterModal = (
    <div className="veil">
      <div className="card modal" role="dialog" aria-modal="true">
        {known ? (
          <>
            <h2>Welcome back</h2>
            <p className="meta">This wallet is already in the sea. Sign a free message to enter.</p>
            <button className="solid" disabled={busy} onClick={() => void signIn()}>
              {busy ? "Signing…" : "Sign in"}
            </button>
          </>
        ) : (
          <>
            <h2>Enter the sea</h2>
            {xHandle ? (
              <p className="x-handle">@{xHandle}</p>
            ) : (
              <a
                className="solid x-link"
                href={xConfigured ? "/api/auth/x/start" : undefined}
                onClick={(event) => {
                  if (xConfigured) return;
                  event.preventDefault();
                  setError(X_ERROR.missing);
                }}
              >
                Connect X
              </a>
            )}
            <label className="field">
              Referral code
              <input
                value={referral}
                readOnly={refLocked}
                onChange={(event) => {
                  if (!refLocked) setReferral(event.target.value);
                }}
                placeholder={referralRequired ? "required" : "the first diver may leave this blank"}
              />
            </label>
            <button className="solid" disabled={busy || !xHandle || (referralRequired && !referral.trim())} onClick={() => void confirm()}>
              {busy ? "Signing…" : "Confirm"}
            </button>
          </>
        )}
        {error ? <p className="error inline">{error}</p> : null}
      </div>
    </div>
  );

  const revealModal = reveal ? (
    <div className="veil">
      <div className="card modal role-reveal" role="dialog" aria-modal="true">
        <div className="role-reveal-head">
          <h2>{ROLE_NAME[reveal.role]}</h2>
          <img src={`/roles/${reveal.role}.png`} alt="" className="role-icon lg" />
        </div>
        <p className="role-ability">{ROLE_COPY[reveal.role]}</p>
        <div className="staked-label">Aura</div>
        <TideNum value={formatAura(reveal.amount)} />
        <button className="solid" onClick={closeReveal}>
          Enter
        </button>
      </div>
    </div>
  ) : null;

  const giftModal = gift ? (
    <div className="veil">
      <div className="card modal center" role="dialog" aria-modal="true">
        <h2>Today’s Aura</h2>
        <TideNum value={formatAura(gift.amount)} />
        <button className="solid" onClick={dismissGift}>
          Continue
        </button>
      </div>
    </div>
  ) : null;

  const resultModal = result ? (
    <div className="veil">
      <div className="card modal result-modal" role="dialog" aria-modal="true">
        <div className="kicker">Tide settled</div>
        <h2>{result.title}</h2>
        <p className="result-question">{result.question}</p>
        <TideResultPicks game={result} />
        <div className="result-modal-net"><TideNet game={result} /></div>
        <button className="solid" onClick={dismissResult}>
          Continue
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`account${viewer ? " viewer" : ""}${viewer && open ? " open" : ""}`}
      onMouseEnter={() => {
        if (viewer) setOpen(true);
      }}
      onMouseLeave={() => {
        if (viewer) setOpen(false);
      }}
    >
      <div className={`account-scroll${viewer && open ? " open" : ""}`}>
        <ScrollFrame rollerSize={16} />
        <div className="account-scroll-content">
          <button
            className="account-trigger"
            disabled={busy && !wallet}
            onClick={() => {
              if (!wallet) void connect();
              else if (!viewer) setStepOpen(true);
              else setOpen((value) => !value);
            }}
          >
            {busy && !wallet ? "Connecting…" : label}
          </button>
          {viewer ? (
            <div className={`account-panel${open ? " open" : ""}`} aria-hidden={!open}>
              <a href="/profile" className="account-profile-link" tabIndex={open ? 0 : -1}>
                <span>Profile</span>
                <img src={`/roles/${viewer.role}.png`} alt="" className="role-icon account-role-icon" />
              </a>
              <button className="menu-link disconnect-link" tabIndex={open ? 0 : -1} onClick={() => void disconnect()}>
                Disconnect
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {error && !stepOpen && !reveal ? <p className="error inline">{error}</p> : null}
      {mounted && reveal ? createPortal(revealModal, document.body) : null}
      {mounted && !reveal && wallet && !viewer && stepOpen ? createPortal(enterModal, document.body) : null}
      {mounted && !reveal && gift ? createPortal(giftModal, document.body) : null}
      {mounted && !reveal && !gift && result ? createPortal(resultModal, document.body) : null}
    </div>
  );
}
