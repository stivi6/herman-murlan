/**
 * Combination classification (SPEC §4.4).
 * Supported: single, pair, triple, bomb (four-of-a-kind), scale (>=5 straight).
 * Precedence: bomb > scale > triple > pair > single.
 */
import type { Card } from "./cards";
import { comparePhysical, rankKeyOf } from "./cards";

/** Display order for a combo: ascending physical strength (3→2, suits stable). */
function sortedIds(cards: Card[]): string[] {
  return [...cards].sort(comparePhysical).map((c) => c.id);
}
import { err, ok, type EngineResult } from "./errors";

export type ComboType = "single" | "pair" | "triple" | "bomb" | "scale";

export interface ClassifiedCombo {
  type: ComboType;
  /** Card IDs in the combo, sorted ascending for stable display. */
  cardIds: string[];
  /** Common rank key for pair/triple/bomb (e.g. "K", "2"). */
  rankKey: string | null;
  /** Canonical rank value for comparison (pair/triple/bomb rank, single card, scale top). */
  strength: number;
  /** Scale length (card count) — equals cardIds.length for scales. */
  length: number;
  /** For scales: top/end rank key in permitted-sequence terms (low A,2,3,4,5 => "5"). */
  topRankKey: string | null;
}

/** Normal scale order 3..A (2 excluded; handled separately). */
const SCALE_NORMAL_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SCALE_NORMAL_INDEX: Record<string, number> = Object.fromEntries(
  SCALE_NORMAL_ORDER.map((r, i) => [r, i]),
);

const LOW_ACE_SET = new Set(["A", "2", "3", "4", "5"]);

function rankValueForScaleTop(topKey: string): number {
  // Strength: normal scales by end index; low A,2,3,4,5 treated as ending at 5.
  if (topKey === "5-LOW") return SCALE_NORMAL_INDEX["5"];
  return SCALE_NORMAL_INDEX[topKey];
}

export function isLowAceScale(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const ranks = new Set(cards.map((c) => (c.isJoker ? "JOKER" : c.rank)));
  if (ranks.size !== 5) return false;
  for (const r of LOW_ACE_SET) if (!ranks.has(r)) return false;
  return true;
}

function classifyScale(cards: Card[]): ClassifiedCombo | null {
  if (cards.length < 5) return null;
  // Jokers never allowed in scales.
  if (cards.some((c) => c.isJoker)) return null;
  const ranks = cards.map((c) => c.rank);
  // No repeated rank.
  if (new Set(ranks).size !== ranks.length) return null;

  // Special low sequence A,2,3,4,5 (exactly 5 cards).
  if (cards.length === 5 && isLowAceScale(cards)) {
    const ids = sortedIds(cards);
    return {
      type: "scale",
      cardIds: ids,
      rankKey: null,
      strength: rankValueForScaleTop("5-LOW"),
      length: 5,
      topRankKey: "5",
    };
  }

  // Otherwise 2 is not allowed anywhere in a scale.
  if (ranks.includes("2")) return null;
  // All ranks must be in normal 3..A order.
  for (const r of ranks) {
    if (!(r in SCALE_NORMAL_INDEX)) return null;
  }
  const sorted = [...ranks].sort((a, b) => SCALE_NORMAL_INDEX[a] - SCALE_NORMAL_INDEX[b]);
  for (let i = 1; i < sorted.length; i++) {
    if (SCALE_NORMAL_INDEX[sorted[i]] !== SCALE_NORMAL_INDEX[sorted[i - 1]] + 1) return null;
  }
  const top = sorted[sorted.length - 1];
  const ids = sortedIds(cards);
  return {
    type: "scale",
    cardIds: ids,
    rankKey: null,
    strength: rankValueForScaleTop(top),
    length: cards.length,
    topRankKey: top,
  };
}

const SINGLE_RANK_VALUE: Record<string, number> = {
  "3": 0,
  "4": 1,
  "5": 2,
  "6": 3,
  "7": 4,
  "8": 5,
  "9": 6,
  "10": 7,
  J: 8,
  Q: 9,
  K: 10,
  A: 11,
  "2": 12,
  JOKER_BLACK: 13,
  JOKER_RED: 14,
};

export function classifyCombination(cards: Card[]): EngineResult<ClassifiedCombo> {
  if (cards.length === 0) return err("EMPTY_SELECTION", "Select at least one card.");
  const ids = sortedIds(cards);

  // Four-of-a-kind (bomb): exactly 4 cards of same normal rank. Jokers can never form a bomb.
  if (cards.length === 4) {
    if (!cards.some((c) => c.isJoker)) {
      const keys = cards.map((c) => c.rank);
      if (new Set(keys).size === 1) {
        const rk = rankKeyOf(cards[0]);
        return ok({
          type: "bomb",
          cardIds: ids,
          rankKey: rk,
          strength: SINGLE_RANK_VALUE[rk] ?? 0,
          length: 4,
          topRankKey: rk,
        });
      }
    }
  }

  // Scale (5+). Precedence over triple/pair/single per spec.
  if (cards.length >= 5) {
    const scale = classifyScale(cards);
    if (scale) return ok(scale);
    return err(
      "INVALID_COMBINATION",
      "Those cards are not a legal combination (scales need 5+ consecutive ranks, no jokers, no gaps).",
    );
  }

  if (cards.length === 4) {
    return err("INVALID_COMBINATION", "Four cards must be four-of-a-kind (same rank).");
  }

  if (cards.length === 3) {
    if (cards.some((c) => c.isJoker)) {
      return err("INVALID_COMBINATION", "Jokers cannot form a triple.");
    }
    const keys = cards.map((c) => c.rank);
    if (new Set(keys).size === 1) {
      const rk = rankKeyOf(cards[0]);
      return ok({
        type: "triple",
        cardIds: ids,
        rankKey: rk,
        strength: SINGLE_RANK_VALUE[rk] ?? 0,
        length: 3,
        topRankKey: rk,
      });
    }
    return err("INVALID_COMBINATION", "A triple needs three cards of the same rank.");
  }

  if (cards.length === 2) {
    if (cards.some((c) => c.isJoker)) {
      // Two jokers are different ranks (BLACK vs RED) — never a pair.
      return err("INVALID_COMBINATION", "The two jokers are different ranks and cannot pair.");
    }
    if (cards[0].rank === cards[1].rank) {
      const rk = rankKeyOf(cards[0]);
      return ok({
        type: "pair",
        cardIds: ids,
        rankKey: rk,
        strength: SINGLE_RANK_VALUE[rk] ?? 0,
        length: 2,
        topRankKey: rk,
      });
    }
    return err("INVALID_COMBINATION", "A pair needs two cards of the same rank.");
  }

  // Single.
  const single = cards[0];
  const rk = rankKeyOf(single);
  return ok({
    type: "single",
    cardIds: ids,
    rankKey: rk,
    strength: SINGLE_RANK_VALUE[rk] ?? 0,
    length: 1,
    topRankKey: rk,
  });
}

/** Canonical comparison value for a single card (A < 2 < Black Joker < Red Joker). */
export function singleCardStrength(card: Card): number {
  return SINGLE_RANK_VALUE[rankKeyOf(card)] ?? 0;
}
