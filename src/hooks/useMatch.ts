"use client";
/**
 * useMatch: authoritative snapshot sync for one match.
 * - Initial fetch + Realtime notification subscription (public rows only).
 * - Polling fallback with exponential backoff when Realtime drops.
 * - Action sender with per-intent UUID + expectedVersion; same actionId retried
 *   on timeout so double-clicks/retries cannot duplicate a move.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  ApiError,
  advanceHand,
  getSnapshot,
  sendAction,
  type ClientIntent,
  type MatchSnapshot,
} from "@/lib/client-api";
import { supabaseBrowser } from "@/lib/auth-client";

export interface MatchState {
  snapshot: MatchSnapshot | null;
  loading: boolean;
  error: string | null;
  connected: "live" | "polling" | "offline";
  acting: boolean;
  notice: string | null;
}

function newActionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useMatch(matchId: string | null) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<"live" | "polling" | "offline">("polling");
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const versionRef = useRef(0);
  const backoffRef = useRef(2000);
  const mountedRef = useRef(true);

  const fetchSnapshot = useCallback(async () => {
    if (!matchId) return;
    try {
      const { snapshot: snap } = await getSnapshot(matchId);
      if (!mountedRef.current) return;
      // Out-of-order guard: overlapping polls/refetches on slow networks can
      // resolve stale-first. Never let an older version overwrite a newer one
      // (versions grow monotonically via server compare-and-swap).
      if (snap.version < versionRef.current) return;
      versionRef.current = snap.version;
      setSnapshot(snap);
      setError(null);
      backoffRef.current = 2000;
    } catch (e) {
      if (!mountedRef.current) return;
      const err = e as ApiError;
      if (err.code === "NOT_CONFIGURED") setError("This deployment is not connected to Supabase yet.");
      else setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [matchId]);

  // Initial fetch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void fetchSnapshot();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchSnapshot]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Realtime subscription -> refetch on new public version.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!matchId) return;
    let channel: RealtimeChannel | null = null;
    let alive = true;
    try {
      const supabase = supabaseBrowser();
      channel = supabase
        .channel(`match:${matchId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "match_public_snapshots",
            filter: `match_id=eq.${matchId}`,
          },
          () => {
            void fetchSnapshot();
          },
        )
        .subscribe((status) => {
          if (!alive) return;
          if (status === "SUBSCRIBED") setConnected("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnected("polling");
        });
    } catch {
      setConnected("polling");
    }
    return () => {
      alive = false;
      if (channel) void supabaseBrowser().removeChannel(channel);
    };
  }, [matchId, fetchSnapshot]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Polling fallback (also covers visibility changes); backs off exponentially.
  useEffect(() => {
    if (!matchId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.hidden) {
        timer = setTimeout(tick, backoffRef.current);
        return;
      }
      await fetchSnapshot();
      backoffRef.current = Math.min(backoffRef.current * 1.5, 8000);
      timer = setTimeout(tick, connected === "live" ? 6000 : backoffRef.current);
    };
    timer = setTimeout(tick, 2500);
    const onVisible = () => {
      if (!document.hidden) void fetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [matchId, fetchSnapshot, connected]);

  const act = useCallback(
    async (intent: ClientIntent, opts?: { retryId?: string }): Promise<boolean> => {
      if (!matchId || acting) return false;
      setActing(true);
      setNotice(null);
      const actionId = opts?.retryId ?? newActionId();
      const expectedVersion = versionRef.current;
      try {
        const res = await sendAction(matchId, actionId, expectedVersion, intent);
        versionRef.current = res.version;
        await fetchSnapshot();
        return true;
      } catch (e) {
        const err = e as ApiError & { retryable?: boolean };
        if (err.code === "STALE_STATE") {
          setNotice("Another move was accepted first — the table refreshed. Choose again.");
          await fetchSnapshot();
        } else if (err.status === 0) {
          // Network timeout with unknown outcome: keep the SAME actionId so a
          // manual retry cannot double-apply. Surface a retry affordance.
          setNotice(`Request timed out. Tap again to retry safely.::${actionId}`);
          await fetchSnapshot();
        } else {
          setNotice(err.message);
        }
        return false;
      } finally {
        setActing(false);
      }
    },
    [matchId, acting, fetchSnapshot],
  );

  const advance = useCallback(async () => {
    if (!matchId) return;
    try {
      await advanceHand(matchId);
      await fetchSnapshot();
    } catch (e) {
      setNotice((e as ApiError).message);
    }
  }, [matchId, fetchSnapshot]);

  return {
    snapshot,
    loading,
    error,
    connected,
    acting,
    notice,
    setNotice,
    refresh: fetchSnapshot,
    act,
    advance,
  };
}
