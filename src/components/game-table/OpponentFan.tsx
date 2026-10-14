"use client";
/**
 * Opponent stations: card-back fan + identity badge (avatar initials, name,
 * remaining count, score, status) with a restrained gold turn glow.
 * SeatChip is the compact variant for the mobile portrait strip.
 */
import type { SnapshotSeat } from "@/lib/client-api";
import { CardBack } from "./CardView";
import { fanOverlapStyle } from "@/lib/cardSizes";
import { cn } from "@/lib/cn";

const MAX_RENDERED = 7;

const AVATAR_COLORS = ["bg-rose-700", "bg-sky-700", "bg-amber-600", "bg-violet-700"];

function statusLine(seat: SnapshotSeat, active: boolean): string {
  if (seat.finished) return `Finished #${seat.placement}`;
  const bits = [`${seat.score} pts`];
  if (seat.passed) bits.push("passed");
  if (!seat.connected) bits.push("offline");
  if (active) bits.push("turn");
  return bits.join(" · ");
}

export function OpponentFan({
  seat,
  orientation,
  active,
}: {
  seat: SnapshotSeat;
  orientation: "top" | "left" | "right";
  active: boolean;
}) {
  const shown = Math.min(seat.cardsRemaining, MAX_RENDERED);
  const vertical = orientation !== "top";
  return (
    <div
      aria-label={`${seat.displayName}, ${seat.cardsRemaining} cards, ${seat.score} points${active ? ", their turn" : ""}`}
      className={cn(
        "rounded-xl border px-2 py-1.5 backdrop-blur-sm transition-shadow duration-200",
        "border-[var(--gold-shadow)]/60 bg-black/45",
        active
          ? "border-[var(--gold)] shadow-[0_0_16px_rgba(234,184,63,0.55)]"
          : "shadow-[0_2px_10px_rgba(0,0,0,0.4)]",
        vertical ? "flex flex-col items-center gap-1" : "flex items-center gap-2",
      )}
    >
      <Fan backs={shown} vertical={vertical} />
      <div className={cn("leading-tight text-[var(--cream)]", vertical ? "text-center" : "min-w-0")}>
        <div className="flex items-center justify-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
              AVATAR_COLORS[seat.seat % AVATAR_COLORS.length],
            )}
          >
            {seat.isBot ? "AI" : seat.displayName.slice(0, 2).toUpperCase()}
          </span>
          <span className="max-w-20 truncate text-xs font-semibold">{seat.displayName}</span>
          {seat.team !== null && (
            <span className="rounded bg-white/15 px-1 text-[10px]">T{seat.team + 1}</span>
          )}
        </div>
        <div className="mt-0.5 whitespace-nowrap text-[11px]">
          {seat.finished ? (
            <span className="text-[var(--text-muted)]">#{seat.placement}</span>
          ) : (
            <span className="font-black text-[var(--gold-highlight)]">×{seat.cardsRemaining}</span>
          )}{" "}
          <span className="text-[var(--text-muted)]">{statusLine(seat, active)}</span>
        </div>
        {active && (
          <div className="mt-0.5 inline-block rounded-full bg-[var(--gold)] px-2 py-px text-[10px] font-black tracking-widest text-[var(--room-shadow)]">
            TURN
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact seat chip for the mobile portrait opponent strip. */
export function SeatChip({ seat, active }: { seat: SnapshotSeat; active: boolean }) {
  return (
    <div
      aria-label={`${seat.displayName}, ${seat.cardsRemaining} cards, ${seat.score} points${active ? ", their turn" : ""}`}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 py-1 backdrop-blur-sm transition-shadow duration-200",
        "border-[var(--gold-shadow)]/60 bg-black/45 text-[11px] text-[var(--cream)]",
        active && "border-[var(--gold)] shadow-[0_0_12px_rgba(234,184,63,0.55)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
          AVATAR_COLORS[seat.seat % AVATAR_COLORS.length],
        )}
      >
        {seat.isBot ? "AI" : seat.displayName.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate font-semibold">{seat.displayName}</span>
      <span className="shrink-0 font-black text-[var(--gold-highlight)]">×{seat.cardsRemaining}</span>
      <span className="shrink-0 text-[var(--text-muted)]">{seat.score}p</span>
      {active && (
        <span className="shrink-0 rounded-full bg-[var(--gold)] px-1 text-[9px] font-black text-[var(--room-shadow)]">
          •
        </span>
      )}
    </div>
  );
}

function Fan({ backs, vertical }: { backs: number; vertical: boolean }) {
  if (backs === 0) {
    return (
      <span className="flex h-10 w-8 items-center justify-center rounded bg-white/10 text-[10px] text-white/70">
        out
      </span>
    );
  }
  return (
    <span aria-hidden className={cn("cw-xs flex", vertical ? "fan-backs-col max-h-24 flex-col items-center overflow-hidden" : "fan-backs-row max-w-24 items-start overflow-hidden")}>
      {Array.from({ length: backs }).map((_, i) => (
        <span
          key={i}
          className="shrink-0"
          style={{
            ...(i > 0 ? fanOverlapStyle("xs", vertical ? -0.55 * 1.4 : -0.55, vertical) : null),
            transform: `rotate(${(i - (backs - 1) / 2) * (vertical ? 3 : 5)}deg)`,
            zIndex: i,
          }}
        >
          <CardBack />
        </span>
      ))}
    </span>
  );
}
