"use client";
import { useState } from "react";
import type { RoomView } from "@/lib/client-api";
import { cn } from "@/lib/cn";

export function LobbyView({
  view,
  acting,
  error,
  onReady,
  onStart,
  onLeave,
  onCopy,
}: {
  view: RoomView;
  acting: boolean;
  error: string | null;
  onReady: (ready: boolean) => void;
  onStart: (allowBots: boolean) => void;
  onLeave: () => void;
  onCopy: () => void;
}) {
  const [allowBots, setAllowBots] = useState(view.room.allowBots);
  const humans = view.members.filter((m) => !m.isBot);
  const allReady = humans.length > 0 && humans.every((m) => m.ready);
  const me = view.members.find((m) => m.seat === view.mySeat);
  const seats = [0, 1, 2, 3].map((s) => view.members.find((m) => m.seat === s) ?? null);
  const canStart = view.isHost && (humans.length === 4 ? allReady : allowBots && allReady && humans.length >= 1);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 bg-zinc-950 p-4 text-white">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Lobby</h1>
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm">
          {view.room.mode === "2v2" ? "2v2 · seats 0+2 vs 1+3" : "Classic FFA"}
        </span>
      </header>

      <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-3">
        <div className="flex-1">
          <p className="text-xs text-zinc-400">Invite code</p>
          <p className="text-2xl font-bold tracking-[0.3em]">{view.room.code}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-zinc-900"
        >
          Copy link
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-900/60 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {seats.map((m, seat) => (
          <li
            key={seat}
            className={cn(
              "flex items-center gap-2 rounded-xl border p-3",
              m ? "border-white/15 bg-white/5" : "border-dashed border-white/15 text-zinc-500",
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
              {m ? m.displayName.slice(0, 2).toUpperCase() : `S${seat + 1}`}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              {m ? (
                <>
                  <p className="truncate text-sm font-semibold">
                    {m.displayName}
                    {m.isHost && <span className="ml-1 text-amber-300">(host)</span>}
                    {m.isBot && <span className="ml-1 text-sky-300">(bot)</span>}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {m.ready ? "Ready" : "Not ready"}
                    {m.team !== null && ` · Team ${m.team + 1}`}
                    {m.presence === "offline" ? " · offline" : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm">Empty seat</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={acting}
          onClick={() => onReady(!(me?.ready ?? false))}
          aria-pressed={me?.ready ?? false}
          className={cn(
            "rounded-xl px-5 py-2.5 font-semibold",
            me?.ready ? "bg-white/15 text-white" : "bg-emerald-500 text-zinc-950",
          )}
        >
          {me?.ready ? "Not ready" : "Ready up"}
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="rounded-xl border border-white/25 px-4 py-2.5 text-sm"
        >
          Leave room
        </button>
      </div>

      {view.isHost && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-white/5 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowBots}
              onChange={(e) => setAllowBots(e.target.checked)}
              className="h-4 w-4"
            />
            Fill empty seats with bots (needs at least 1 ready human)
          </label>
          <button
            type="button"
            disabled={!canStart || acting}
            onClick={() => onStart(allowBots)}
            title={
              humans.length < 4 && !allowBots
                ? "Need four ready humans or enable bot fill"
                : !allReady
                  ? "All humans must be ready"
                  : "Start the match"
            }
            className="rounded-xl bg-amber-300 px-5 py-2.5 font-bold text-zinc-900 disabled:opacity-40"
          >
            {acting ? "Starting…" : "Start match"}
          </button>
          {!allReady && <p className="text-xs text-zinc-400">Waiting for all humans to ready up…</p>}
        </div>
      )}
      {!view.isHost && <p className="text-xs text-zinc-400">Only the host can start the match.</p>}
    </div>
  );
}
