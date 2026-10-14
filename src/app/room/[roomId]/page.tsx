"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, endMatch, leaveRoom, rematchToLobby, setReady, startMatch } from "@/lib/client-api";
import { ensureSession, applyMotionPreference } from "@/lib/auth-client";
import { useRoom } from "@/hooks/useRoom";
import { useMatch } from "@/hooks/useMatch";
import { LobbyView } from "@/components/lobby/LobbyView";
import { GameTable } from "@/components/game-table/GameTable";

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-white">
          <p>Loading room…</p>
        </div>
      }
    >
      <RoomInner />
    </Suspense>
  );
}

function RoomInner() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();
  const { room, loading, error, refresh } = useRoom(roomId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [copied, setCopied] = useState(false);

  const matchId = room?.room.currentMatchId ?? null;
  const inMatch = room?.room.status === "playing" && matchId !== null;
  const match = useMatch(inMatch ? matchId : null);

  useEffect(() => {
    applyMotionPreference();
    void ensureSession();
  }, []);

  const onReady = useCallback(
    async (ready: boolean) => {
      setActing(true);
      setActionError(null);
      try {
        await setReady(roomId, ready);
        await refresh();
      } catch (e) {
        setActionError((e as ApiError).message);
      } finally {
        setActing(false);
      }
    },
    [roomId, refresh],
  );

  const onStart = useCallback(
    async (allowBots: boolean) => {
      setActing(true);
      setActionError(null);
      try {
        await startMatch(roomId, allowBots);
        await refresh();
      } catch (e) {
        setActionError((e as ApiError).message);
      } finally {
        setActing(false);
      }
    },
    [roomId, refresh],
  );

  const onLeave = useCallback(async () => {
    try {
      await leaveRoom(roomId);
    } catch {
      // Leave is best-effort once the user navigates away.
    }
    router.push("/");
  }, [roomId, router]);

  const onCopy = useCallback(async () => {
    if (!room) return;
    const url = `${window.location.origin}/join?code=${room.room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Copy failed — long-press the code instead.");
    }
  }, [room]);

  const onRematch = useCallback(async () => {
    setActing(true);
    try {
      await rematchToLobby(roomId);
      await refresh();
    } catch (e) {
      match.setNotice((e as ApiError).message);
    } finally {
      setActing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, refresh]);

  const onLobby = useCallback(() => {
    void refresh();
  }, [refresh]);

  const onEndMatch = useCallback(async () => {
    try {
      await endMatch(roomId);
    } catch (e) {
      match.setNotice((e as ApiError).message);
      return;
    }
    await refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, refresh]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-white">
        <p aria-live="polite">Loading room…</p>
      </div>
    );
  }
  if (error || !room) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 bg-zinc-950 p-5 text-white">
        <p role="alert" className="rounded-lg bg-red-900/60 px-4 py-3 text-center text-sm">
          {error ?? "Room not found."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-xl bg-white/10 px-4 py-2"
        >
          Back home
        </button>
      </div>
    );
  }

  if (inMatch && matchId) {
    if (match.loading || !match.snapshot) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-emerald-950 text-white">
          <p aria-live="polite">{match.error ?? "Loading table…"}</p>
        </div>
      );
    }
    return (
      <GameTable
        snapshot={match.snapshot}
        acting={match.acting || acting}
        notice={match.notice}
        connected={match.connected === "live" ? "live" : "polling"}
        onAct={match.act}
        onAdvance={match.advance}
        onRematch={onRematch}
        onLobby={onLobby}
        onLeave={onLeave}
        onEndMatch={onEndMatch}
      />
    );
  }

  // Finished room with no active match -> show lobby (rematch flow returns here).
  return (
    <div>
      {copied && (
        <p role="status" className="bg-emerald-600 px-3 py-1 text-center text-xs text-white">
          Invite link copied!
        </p>
      )}
      <LobbyView
        view={room}
        acting={acting}
        error={actionError}
        onReady={onReady}
        onStart={onStart}
        onLeave={onLeave}
        onCopy={onCopy}
      />
    </div>
  );
}
