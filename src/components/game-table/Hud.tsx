"use client";
/**
 * Compact gold-and-burgundy status bar: connection, mode, hand, target,
 * scores and utility actions. Wraps on small screens; crest sits center.
 */
import type { MatchSnapshot } from "@/lib/client-api";
import { cn } from "@/lib/cn";

export function Hud({
  snapshot,
  connected,
  onRules,
  onEnd,
  onLeave,
}: {
  snapshot: MatchSnapshot;
  connected: "live" | "polling" | "offline";
  onRules: () => void;
  onEnd: () => void;
  onLeave: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-2 py-1.5 sm:px-3">
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-semibold",
            connected === "live" ? "bg-emerald-500/85 text-white" : "bg-[var(--gold)] text-[var(--room-shadow)]",
          )}
          title={connected === "live" ? "Realtime connected" : "Polling for updates"}
        >
          {connected === "live" ? "live" : "syncing"}
        </span>
        <span className="rounded-full border border-[var(--gold-shadow)] bg-black/40 px-2 py-0.5 text-[var(--cream)]">
          {snapshot.mode === "2v2" ? "2v2" : "FFA"} · Hand #{snapshot.handNumber}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full border border-[var(--gold)]/70 bg-black/50 px-2.5 py-1 text-xs text-[var(--cream)] sm:text-sm">
          Target <strong className="text-[var(--gold-highlight)]">{snapshot.target}</strong>
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <ScoreChips snapshot={snapshot} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRules}
            aria-label="Game rules"
            className="rounded-lg border border-[var(--gold-shadow)] bg-black/40 px-2 py-1 text-[11px] text-[var(--cream)] transition-colors hover:border-[var(--gold)] sm:text-xs"
          >
            Rules
          </button>
          {snapshot.isHost && snapshot.status !== "finished" && (
            <button
              type="button"
              onClick={onEnd}
              aria-label="End match"
              className="rounded-lg border border-[var(--danger)] bg-black/40 px-2 py-1 text-[11px] text-red-200 transition-colors hover:border-red-400 sm:text-xs"
            >
              End
            </button>
          )}
          <button
            type="button"
            onClick={onLeave}
            aria-label="Leave room"
            className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-white/40 hover:text-white sm:text-xs"
          >
            Leave
          </button>
        </div>
      </div>
    </header>
  );
}

function ScoreChips({ snapshot }: { snapshot: MatchSnapshot }) {
  if (snapshot.mode === "2v2" && snapshot.teamTotals) {
    return (
      <span className="hidden rounded-full border border-[var(--gold-shadow)] bg-black/40 px-2 py-0.5 text-[11px] text-[var(--cream)] sm:inline md:text-xs">
        T1 <strong className="text-[var(--gold-highlight)]">{snapshot.teamTotals[0]}</strong>
        {" · "}T2 <strong className="text-[var(--gold-highlight)]">{snapshot.teamTotals[1]}</strong>
      </span>
    );
  }
  return (
    <span className="hidden max-w-56 truncate text-[11px] text-[var(--text-muted)] sm:inline md:max-w-none md:text-xs">
      {snapshot.seats.map((s, i) => (
        <span key={s.seat} className={cn(s.isTurn && "font-bold text-[var(--gold-highlight)]")}>
          {i > 0 && " · "}
          {s.displayName} {s.score}
        </span>
      ))}
    </span>
  );
}
