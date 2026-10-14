"use client";
/** useRoom: lobby polling (2s) + heartbeat (15s) + visibility refetch. */
import { useCallback, useEffect, useState } from "react";
import { ApiError, getRoom, sendHeartbeat, type RoomView } from "@/lib/client-api";

export function useRoom(roomId: string | null) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const view = await getRoom(roomId);
      setRoom(view);
      setError(null);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "NOT_CONFIGURED") setError("This deployment is not connected to Supabase yet.");
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // loading starts true on mount (useState initializer); roomId changes remount via routing.
    void refresh();
    if (!roomId) return;
    const poll = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2000);
    const beat = setInterval(() => {
      if (!document.hidden) void sendHeartbeat(roomId, "online").catch(() => undefined);
    }, 15000);
    const onVisible = () => {
      if (!document.hidden) {
        void refresh();
        void sendHeartbeat(roomId, "online").catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Polling/subscription effect syncing with the server (external system).
  }, [roomId, refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { room, loading, error, refresh };
}
