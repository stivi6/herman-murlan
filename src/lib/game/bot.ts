/**
 * Deterministic rules-based bot (SPEC §4.6).
 * Uses only the bot's own hand + public table state via legalPlaysFromHand.
 * Heuristic: when leading, play the lowest single; otherwise play the lowest
 * combination that beats the table; pass when nothing beats.
 * Never mutates state; the server submits its choice through applyAction.
 */
import type { Card } from "./cards";
import { rankValueOf } from "./cards";
import type { ClassifiedCombo } from "./combinations";
import { legalPlaysFromHand } from "./transitions";

export interface BotTurnInput {
  hand: Card[];
  table: ClassifiedCombo | null;
  /** True when this bot leads a fresh trick (table open). */
  leading: boolean;
  /** True when the opening must contain S3 (first hand, opening pending). */
  mustIncludeS3: boolean;
}

export type BotDecision = { kind: "play"; cardIds: string[] } | { kind: "pass" };

function comboSortKey(c: ClassifiedCombo): number {
  // Prefer lower strength; prefer fewer cards.
  return c.strength * 100 + c.length;
}

export function chooseBotMove(input: BotTurnInput): BotDecision {
  const legal = legalPlaysFromHand(input.hand, input.table);
  let candidates = legal;
  if (input.mustIncludeS3) {
    candidates = legal.filter((c) => c.cardIds.includes("S3"));
    if (candidates.length === 0) {
      // No S3-containing legal play exists (should be impossible since single S3
      // is always legal on an open table) — pass defensively is wrong; play S3 single.
      const s3 = input.hand.find((c) => c.id === "S3");
      if (s3 && input.table === null) return { kind: "play", cardIds: ["S3"] };
      return { kind: "pass" };
    }
  }
  if (candidates.length === 0) {
    if (input.leading) {
      // Leading with no legal play is impossible (singles always legal); defensive.
      return { kind: "pass" };
    }
    return { kind: "pass" };
  }
  candidates.sort((a, b) => {
    const k = comboSortKey(a) - comboSortKey(b);
    if (k !== 0) return k;
    return a.cardIds.join(",") < b.cardIds.join(",") ? -1 : 1;
  });
  if (input.leading) {
    // Lead lowest single to conserve combinations (simple, explainable).
    const singles = candidates.filter((c) => c.type === "single");
    const pick = singles[0] ?? candidates[0];
    return { kind: "play", cardIds: pick.cardIds };
  }
  return { kind: "play", cardIds: candidates[0].cardIds };
}

/** Exchange return choice: lowest 3–10 card, else lowest card overall. */
export function chooseBotExchangeReturn(hand: Card[]): string {
  const low = hand
    .filter((c) => ["3", "4", "5", "6", "7", "8", "9", "10"].includes(c.rank))
    .sort((a, b) => rankValueOf(a) - rankValueOf(b) || (a.id < b.id ? -1 : 1));
  if (low.length > 0) return low[0].id;
  const sorted = [...hand].sort((a, b) => rankValueOf(a) - rankValueOf(b));
  return sorted[0].id;
}
