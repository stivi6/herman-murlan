/**
 * Card-exchange helpers (SPEC §4.8). Pure.
 */
import type { Card } from "./cards";
import { BLACK_JOKER_ID, RED_JOKER_ID, comparePhysical, isLowReturnRank } from "./cards";

export interface ExchangePlan {
  /** Whether cards are exchanged at all. */
  swap: boolean;
  /** Card the 4th-place player must give (highest), if swap. */
  fourthGivesId: string | null;
  /** Reason code for UI messaging. */
  reason: "normal" | "fourth-holds-both-jokers";
}

/** Fourth-place gives their single highest-ranked card (canonical order). */
export function highestCardForExchange(hand: Card[]): Card {
  if (hand.length === 0) throw new Error("highestCardForExchange: empty hand");
  return [...hand].sort(comparePhysical).at(-1)!;
}

export function fourthHoldsBothJokers(fourthHand: Card[]): boolean {
  const ids = new Set(fourthHand.map((c) => c.id));
  return ids.has(BLACK_JOKER_ID) && ids.has(RED_JOKER_ID);
}

export function planExchange(fourthHand: Card[]): ExchangePlan {
  if (fourthHoldsBothJokers(fourthHand)) {
    return { swap: false, fourthGivesId: null, reason: "fourth-holds-both-jokers" };
  }
  return { swap: true, fourthGivesId: highestCardForExchange(fourthHand).id, reason: "normal" };
}

/** Does the first-place player hold any 3–10 card (for the return restriction)? */
export function firstHasLowCard(firstHandPlusReceived: Card[], receivedId: string): boolean {
  return firstHandPlusReceived.some((c) => c.id !== receivedId && isLowReturnRank(c));
}

/**
 * Validate the first-place return card.
 * Normally rank must be 3–10 inclusive. Fallback: if the player holds no
 * 3–10 (excluding the received card), any single card is allowed.
 */
export function validateExchangeReturn(
  firstHandPlusReceived: Card[],
  receivedId: string,
  returnId: string,
): { ok: true } | { ok: false; message: string; fallbackUsed: boolean } {
  const owned = new Set(firstHandPlusReceived.map((c) => c.id));
  if (!owned.has(returnId)) {
    return { ok: false, message: "You must give a card from your hand.", fallbackUsed: false };
  }
  if (returnId === receivedId) {
    // Edge: giving back the just-received card is allowed only if it is itself
    // 3–10 or the fallback applies; simplest is to run the same rank check.
  }
  const card = firstHandPlusReceived.find((c) => c.id === returnId)!;
  if (isLowReturnRank(card)) return { ok: true };
  // Fallback when no 3–10 available.
  const others = firstHandPlusReceived.filter((c) => c.id !== receivedId);
  const hasLow = others.some((c) => isLowReturnRank(c));
  // Also consider: if the only low card is the received one and they return something else... rule says
  // "If the first-place player has no cards ranked 3–10, fallback: they may give any one card."
  // "Has" is evaluated on their hand including received card? We evaluate excluding received
  // to avoid forcing them to return the received card itself. If excluding-received has no low
  // card, allow any.
  if (!hasLow) return { ok: true };
  return {
    ok: false,
    message: "Give a card ranked 3–10 (rule exception only if you hold none).",
    fallbackUsed: false,
  };
}
