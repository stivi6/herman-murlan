"use client";
/**
 * The player's hand: always sorted low→high (canonical order). Card width is
 * measured from the available space and the card count so 1–14 cards fit
 * their region (scrolling only as a last resort on the tiniest screens).
 * On the player's turn the fan visibly wakes up (zoom + warm underglow).
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SnapshotCard } from "@/lib/client-api";
import { sortCardsAscending } from "@/lib/game/cards";
import { CardView } from "./CardView";
import { cn } from "@/lib/cn";

const MAX_CARD_W = 104;
const MIN_CARD_W = 44;
/** Share of each card consumed by overlap (i.e. visible pitch = 40%). */
const PITCH_RATIO = 0.4;

export function PlayerHand({
  cards,
  selected,
  onToggle,
  disabled,
  zoomed,
}: {
  cards: SnapshotCard[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled: boolean;
  /** True on the player's turn: the whole fan grows (turn signal). */
  zoomed: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState<number>(72);
  const ordered = useMemo(() => sortCardsAscending(cards), [cards]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => {
      const avail = el.clientWidth - 16; // px-2 padding
      const n = Math.max(ordered.length, 1);
      const w = Math.floor(Math.min(MAX_CARD_W, avail / (1 + (n - 1) * PITCH_RATIO)));
      setCardW(Math.max(MIN_CARD_W, w));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ordered.length]);

  const overlap = -Math.round(cardW * (1 - PITCH_RATIO));
  const sel = new Set(selected);
  const toggleAndFocus = (id: string, el?: HTMLElement) => {
    onToggle(id);
    // Tap-to-focus: buried cards scroll into view so the pick is visible.
    requestAnimationFrame(() => {
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  };

  return (
    <div
      role="group"
      aria-label="Your hand"
      data-testid="player-hand"
      className={cn("transition-all duration-200", zoomed ? "hand-turn" : "hand-idle")}
      style={
        zoomed
          ? {
              transform: "scale(1.1) translateY(-5px)",
              filter: "drop-shadow(0 0 18px rgba(234, 184, 63, 0.55))",
              transition: "transform 220ms ease-out, filter 220ms",
            }
          : { transform: "scale(1)", transition: "transform 220ms ease-out, filter 220ms" }
      }
    >
      <div
        ref={scroller}
        className="fan-hand cw-hand flex w-full max-w-full items-end justify-center overflow-x-auto px-2 pb-3 pt-6"
      >
        {ordered.map((c, i) => (
          <div
            key={c.id}
            data-hand-card={c.id}
            style={{
              zIndex: sel.has(c.id) ? 50 + i : i,
              ...(i > 0 ? { marginLeft: overlap } : null),
              width: cardW,
              flexShrink: 0,
            }}
          >
            <CardView
              id={c.id}
              fill
              selected={sel.has(c.id)}
              selectable={!disabled}
              onToggle={(id) => {
                const node = scroller.current?.querySelector<HTMLElement>(
                  `[data-hand-card="${id}"]`,
                );
                toggleAndFocus(id, node ?? undefined);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
