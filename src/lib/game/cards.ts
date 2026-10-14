/**
 * Canonical card model for Murlan (SPEC §4.1).
 * Pure module: no React, no Supabase, no Math.random, no Date.
 */

export type Suit = "S" | "H" | "D" | "C";

export type NormalRank =
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A"
  | "2";

export type JokerKind = "BLACK" | "RED";

export interface Card {
  /** Stable physical ID, e.g. S3, H10, CJ, DA, C2, JOKER_BLACK, JOKER_RED */
  id: string;
  /** Display rank label: 3..10,J,Q,K,A,2, or JOKER */
  rank: string;
  /** Null for jokers */
  suit: Suit | null;
  isJoker: boolean;
  jokerKind: JokerKind | null;
}

/** Canonical single-card order, lowest to highest (SPEC §4.1). */
export const CANONICAL_RANK_ORDER: string[] = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
  "JOKER_BLACK",
  "JOKER_RED",
];

export const RANK_VALUE: Record<string, number> = Object.fromEntries(
  CANONICAL_RANK_ORDER.map((r, i) => [r, i]),
);

/** Deterministic suit order used only for tie-breaking exchange selection. */
export const SUIT_ORDER: Record<Suit, number> = { C: 0, D: 1, H: 2, S: 3 };

export const BLACK_JOKER_ID = "JOKER_BLACK";
export const RED_JOKER_ID = "JOKER_RED";
export const S3_ID = "S3";

const SUITS: Suit[] = ["S", "H", "D", "C"];
const NORMAL_RANKS: NormalRank[] = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
];

export function cardIdFor(suit: Suit, rank: NormalRank): string {
  return `${suit}${rank}`;
}

/** Key used for rank grouping: normal rank label or JOKER_BLACK / JOKER_RED. */
export function rankKeyOf(card: Card): string {
  if (card.isJoker) return card.jokerKind === "RED" ? "JOKER_RED" : "JOKER_BLACK";
  return card.rank;
}

export function rankValueOf(card: Card): number {
  return RANK_VALUE[rankKeyOf(card)];
}

/** Total order for physical cards: rank first, then deterministic suit order. */
export function comparePhysical(a: Card, b: Card): number {
  const rv = rankValueOf(a) - rankValueOf(b);
  if (rv !== 0) return rv;
  const sa = a.suit ? SUIT_ORDER[a.suit] : 99;
  const sb = b.suit ? SUIT_ORDER[b.suit] : 99;
  if (sa !== sb) return sa - sb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Display order: ascending strength (rank first), stable by ID. Works for Card and snapshot cards. */
export function sortCardsAscending<T extends { id: string; rank: string; isJoker: boolean }>(
  cards: T[],
): T[] {
  const val = (c: T) => RANK_VALUE[c.isJoker ? c.id : c.rank] ?? 0;
  return [...cards].sort((a, b) => val(a) - val(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function sortCardsDescending(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => comparePhysical(b, a));
}

export function makeCard(suit: Suit, rank: NormalRank): Card {
  return { id: cardIdFor(suit, rank), rank, suit, isJoker: false, jokerKind: null };
}

export function makeBlackJoker(): Card {
  return { id: BLACK_JOKER_ID, rank: "JOKER", suit: null, isJoker: true, jokerKind: "BLACK" };
}

export function makeRedJoker(): Card {
  return { id: RED_JOKER_ID, rank: "JOKER", suit: null, isJoker: true, jokerKind: "RED" };
}

/** Build the full 54-card deck in a canonical (unshuffled) order. */
export function createFullDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of NORMAL_RANKS) {
    for (const suit of SUITS) {
      deck.push(makeCard(suit, rank));
    }
  }
  deck.push(makeBlackJoker());
  deck.push(makeRedJoker());
  return deck;
}

/** Rebuild a Card object from a stable ID. Throws on unknown ID. */
export function cardFromId(id: string): Card {
  if (id === BLACK_JOKER_ID) return makeBlackJoker();
  if (id === RED_JOKER_ID) return makeRedJoker();
  if (id.length < 2) throw new Error(`Unknown card id: ${id}`);
  const suit = id[0] as Suit;
  const rank = id.slice(1) as NormalRank;
  if (!SUITS.includes(suit)) throw new Error(`Unknown card id: ${id}`);
  if (!NORMAL_RANKS.includes(rank)) throw new Error(`Unknown card id: ${id}`);
  return makeCard(suit, rank);
}

export function cardsFromIds(ids: string[]): Card[] {
  return ids.map(cardFromId);
}

export function isLowReturnRank(card: Card): boolean {
  if (card.isJoker) return false;
  return ["3", "4", "5", "6", "7", "8", "9", "10"].includes(card.rank);
}

/** Display label for rank on the card face. Standard international labels (J/Q/K). */
export function rankDisplayLabel(rank: string): string {
  return rank;
}

/** Full human-readable rank name (Albanian name in parentheses). Used for tooltips. */
export function rankFullName(rank: string): string {
  switch (rank) {
    case "J":
      return "Jack (Fant)";
    case "Q":
      return "Queen (Çupë)";
    case "K":
      return "King (Mbret)";
    case "A":
      return "Ace (As)";
    case "JOKER":
      return "Joker (Xhol)";
    default:
      return rank;
  }
}

export function suitSymbol(suit: Suit | null, jokerKind: JokerKind | null = null): string {
  if (jokerKind === "RED") return "★";
  if (jokerKind === "BLACK") return "★";
  switch (suit) {
    case "S":
      return "♠";
    case "H":
      return "♥";
    case "D":
      return "♦";
    case "C":
      return "♣";
    default:
      return "?";
  }
}
