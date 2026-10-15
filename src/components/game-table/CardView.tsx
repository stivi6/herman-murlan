"use client";
/**
 * Card rendering backed by the vendored CC0 SVG deck (public/cards/*.svg,
 * see THIRD_PARTY_NOTICES.md). Faces are real full-pip artwork; the back is
 * used for opponent fans. Files are local — never hotlinked.
 *
 * Sizing is viewport-relative: the .mcard width comes from --cw, set by the
 * cw-* variant classes (clamp() over vmin), so cards fill phones and large
 * monitors alike.
 */
import { rankFullName } from "@/lib/game/cards";
import { cardBoxStyle, type CardWidthKey } from "@/lib/cardSizes";
import { cn } from "@/lib/cn";

export function cardArtUrl(id: string): string {
  return `/cards/${id}.svg`;
}

export const CARD_BACK_URL = "/cards/CARD_BACK.svg";

const SUIT_NAME: Record<string, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };

function cardName(id: string): string {
  if (id === "JOKER_BLACK") return "Black joker";
  if (id === "JOKER_RED") return "Red joker";
  const suit = SUIT_NAME[id[0]] ?? id[0];
  const rank = rankFullName(id.slice(1));
  return `${rank} of ${suit}`;
}

export type CardSizeVariant = CardWidthKey;

const SIZE_CLASS: Record<CardSizeVariant, string> = {
  xs: "cw-xs",
  sm: "cw-sm",
  hand: "cw-hand",
  trick: "cw-trick",
};

interface Props {
  id: string;
  selected?: boolean;
  selectable?: boolean;
  size?: CardSizeVariant;
  dimmed?: boolean;
  /** Fill the parent width instead of using the viewport-relative size. */
  fill?: boolean;
  onToggle?: (id: string) => void;
}

export function CardView({ id, selected, selectable, size = "hand", dimmed, fill, onToggle }: Props) {
  const name = cardName(id);
  return (
    <button
      type="button"
      data-card-id={id}
      aria-label={name}
      title={name}
      aria-pressed={selected}
      disabled={!selectable}
      onClick={() => onToggle?.(id)}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && selectable) {
          e.preventDefault();
          onToggle?.(id);
        }
      }}
      className={cn(
        "mcard relative shrink-0 overflow-hidden rounded-[8%] bg-white shadow-md transition-all duration-150",
        SIZE_CLASS[size],
        selected
          ? "-translate-y-4 scale-[1.06] shadow-[0_10px_24px_rgba(0,0,0,0.5)] ring-[3px] ring-amber-300"
          : "ring-1 ring-black/40",
        dimmed && "opacity-60",
        selectable ? "cursor-pointer hover:-translate-y-2 hover:scale-105" : "cursor-default",
      )}
      style={fill ? { width: "100%", aspectRatio: "5 / 7" } : cardBoxStyle(size)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local static SVG deck; next/image cannot optimize SVGs */}
      <img src={cardArtUrl(id)} alt="" aria-hidden draggable={false} className="h-full w-full select-none" />
    </button>
  );
}

/** Face-down card back for opponent fans. Purely decorative. */
export function CardBack({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mcard cw-xs relative block shrink-0 overflow-hidden rounded-[8%] bg-white shadow-md ring-1 ring-black/40",
        className,
      )}
      style={cardBoxStyle("xs")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local static SVG back; next/image cannot optimize SVGs */}
      <img src={CARD_BACK_URL} alt="" aria-hidden draggable={false} className="h-full w-full select-none" />
    </span>
  );
}
