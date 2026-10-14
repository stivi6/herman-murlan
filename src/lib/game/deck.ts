/**
 * Deck construction + deterministic round-robin dealing (SPEC §4.2).
 * Pure: no randomness here. Shuffling lives in server-only deal.ts.
 */
import type { Card } from "./cards";
import { createFullDeck } from "./cards";

export { createFullDeck };

/**
 * Deal all cards round-robin clockwise starting at startSeat.
 * 54 cards over 4 seats => two seats get 14, two get 13.
 * The two seats earliest in dealing order get the extra cards.
 */
export function dealRoundRobin(deck: Card[], startSeat: 0 | 1 | 2 | 3): Card[][] {
  if (deck.length !== 54) {
    throw new Error(`dealRoundRobin expects 54 cards, got ${deck.length}`);
  }
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) {
    const seat = ((startSeat + i) % 4) as 0 | 1 | 2 | 3;
    hands[seat].push(deck[i]);
  }
  return hands;
}

/** Verify a deal accounts for all 54 physical cards exactly once. */
export function verifyDealAccountsForAllCards(hands: Card[][]): boolean {
  const seen = new Set<string>();
  let total = 0;
  for (const hand of hands) {
    for (const c of hand) {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      total++;
    }
  }
  return total === 54 && seen.size === 54;
}

/** Hand sizes must be two 14s and two 13s in some seat order. */
export function verifyHandSizes(hands: Card[][]): boolean {
  const sizes = hands.map((h) => h.length).sort((a, b) => b - a);
  return sizes[0] === 14 && sizes[1] === 14 && sizes[2] === 13 && sizes[3] === 13;
}
