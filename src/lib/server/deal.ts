/**
 * Server-only dealing: cryptographically secure Fisher–Yates shuffle.
 * Convention: import only from server code (Route Handlers / server actions).
 * (No `server-only` package import here so Vitest can exercise the shuffle;
 * the admin Supabase client keeps the hard server-only guard.)
 */
import { randomInt } from "node:crypto";
import type { Card } from "../game/cards";
import { createFullDeck } from "../game/cards";
import { dealRoundRobin } from "../game/deck";

export function shuffledDeck(): Card[] {
  const deck = createFullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function dealNewHands(startSeat: 0 | 1 | 2 | 3): [Card[], Card[], Card[], Card[]] {
  return dealRoundRobin(shuffledDeck(), startSeat) as [Card[], Card[], Card[], Card[]];
}

export function randomStartSeat(): 0 | 1 | 2 | 3 {
  return randomInt(4) as 0 | 1 | 2 | 3;
}
