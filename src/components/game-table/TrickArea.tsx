"use client";
/**
 * Center pile: played cards lie naturally on the felt (no placeholder box).
 * Overlap adapts to card count so scales stay on-screen; a small caption
 * names the last actor when the data supports it.
 */
import { CardView } from "./CardView";
import { fanOverlapStyle } from "@/lib/cardSizes";
import { cn } from "@/lib/cn";

function overlapFor(count: number): number {
  if (count <= 3) return -0.35;
  if (count <= 6) return -0.45;
  return -0.55;
}

export function TrickArea({
  current,
  openingPending,
  pending,
  actorName,
}: {
  current: { type: string; cardIds: string[]; playedBy: number } | null;
  openingPending: boolean;
  pending?: string[] | null;
  actorName?: string | null;
}) {
  const shownIds = pending ?? current?.cardIds ?? null;
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-1" aria-live="polite">
      {openingPending && (
        <p className="rounded-full bg-black/50 px-3 py-1 text-xs text-[var(--gold-highlight)]">
          Opening must include 3♠
        </p>
      )}
      {shownIds ? (
        <>
          <div className="fan-trick cw-trick flex max-w-full flex-wrap items-center justify-center px-2 py-2">
            {shownIds.map((id, i) => (
              <span
                key={id}
                className={cn(pending && "animate-pulse")}
                style={{
                  ...(i > 0 ? fanOverlapStyle("trick", overlapFor(shownIds.length)) : null),
                  transform: `rotate(${(i - (shownIds.length - 1) / 2) * (shownIds.length > 4 ? 4 : 7)}deg)`,
                  zIndex: i,
                  filter: "drop-shadow(0 6px 8px rgba(20, 2, 3, 0.55))",
                }}
              >
                <CardView id={id} size="trick" />
              </span>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            {pending ? "Sending…" : actorName ? `${actorName} played` : "On the table"}
          </p>
        </>
      ) : (
        <p className="rounded-full border border-dashed border-[var(--gold-shadow)]/50 px-4 py-2 text-xs text-[var(--text-muted)]">
          Open table — lead any combination
        </p>
      )}
    </div>
  );
}
