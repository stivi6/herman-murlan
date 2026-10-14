import type { CSSProperties } from "react";

/**
 * Viewport-relative card widths. Applied as INLINE styles (not globals.css)
 * so sizing can never go stale behind a cached stylesheet: cards fill phones
 * and 25" monitors alike, and overlaps stay proportional at every size.
 */
export const CARD_W = {
  xs: "clamp(1.5rem, 4.5vmin, 2.5rem)",
  sm: "clamp(2rem, 6vmin, 3.5rem)",
  hand: "clamp(3rem, 9vmin, 6.5rem)",
  trick: "clamp(3.25rem, 10.5vmin, 7.5rem)",
} as const;

export type CardWidthKey = keyof typeof CARD_W;

export function cardBoxStyle(size: CardWidthKey): CSSProperties {
  return { width: CARD_W[size], aspectRatio: "5 / 7" };
}

/** Negative overlap for fan children after the first (factor is negative). */
export function fanOverlapStyle(size: CardWidthKey, factor: number, vertical = false): CSSProperties {
  const value = `calc(${CARD_W[size]} * ${factor})`;
  return vertical ? { marginTop: value } : { marginLeft: value };
}
