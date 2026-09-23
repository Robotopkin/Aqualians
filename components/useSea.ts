"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicState } from "@/lib/types";

export function useSea() {
  const [state, setState] = useState<PublicState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("The sea did not respond");
    const next = (await response.json()) as PublicState;
    setState(next);
    setNow(next.now);
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Something went wrong"));
    const poll = setInterval(() => void load().catch(() => undefined), 15000);
    const tick = setInterval(() => setNow((n) => n + 1000), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const offset = state ? now - state.now : 0;
  const serverNow = (state?.now ?? now) + offset;
  return { state, serverNow, error, setError, load };
}
