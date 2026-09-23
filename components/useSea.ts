"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicState } from "@/lib/types";

async function readJson(response: Response): Promise<{ error?: string } & Partial<PublicState>> {
  const text = await response.text();
  if (!text) throw new Error("The sea did not respond");
  try {
    return JSON.parse(text) as { error?: string } & Partial<PublicState>;
  } catch {
    throw new Error("The sea did not respond");
  }
}

export function useSea() {
  const [state, setState] = useState<PublicState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const seen = useRef(false);
  const flying = useRef(false);

  const load = useCallback(async () => {
    if (flying.current) return;
    flying.current = true;
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const body = await readJson(response);
      if (!response.ok || !body.rounds) throw new Error(body.error || "The sea did not respond");
      setState(body as PublicState);
      setNow(body.now ?? Date.now());
      setError("");
      seen.current = true;
    } catch (err) {
      if (!seen.current) setError(err instanceof Error ? err.message : "The sea did not respond");
    } finally {
      flying.current = false;
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 20000);
    const tick = setInterval(() => setNow((n) => n + 1000), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const offset = state ? now - state.now : 0;
  const serverNow = (state?.now ?? now) + offset;
  return { state, serverNow, error, setError, load, ready };
}
