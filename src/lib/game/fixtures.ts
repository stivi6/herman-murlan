/**
 * Test-only fixtures. NEVER imported by production code paths.
 * (SPEC §12: fixtures.ts must never affect production.)
 */
import { cardFromId, type Card } from "./cards";
import type { MatchState, Seat } from "./state";
import { createInitialMatchState } from "./state";
import { startHandWithHands } from "./transitions";

export function hand(ids: string[]): Card[] {
  return ids.map(cardFromId);
}

/** Build a mid-game state with explicit hands and actor for tests. */
export function testStateWithHands(
  hands: [string[], string[], string[], string[]],
  actor: Seat = 0,
  opts: { isFirstHand?: boolean; openingPending?: boolean; mode?: "ffa" | "2v2" } = {},
): MatchState {
  const base = createInitialMatchState({
    matchId: "test-match",
    roomId: "test-room",
    mode: opts.mode ?? "ffa",
  });
  const cardHands = [
    hand(hands[0]),
    hand(hands[1]),
    hand(hands[2]),
    hand(hands[3]),
  ] as [Card[], Card[], Card[], Card[]];
  const started = startHandWithHands(base, cardHands, {
    handNumber: 1,
    isFirstHand: opts.isFirstHand ?? false,
    forcedLeader: actor,
  });
  return {
    ...started,
    isFirstHand: opts.isFirstHand ?? false,
    openingPending: opts.openingPending ?? false,
    currentActor: actor,
  };
}

/** A full 54-card split used by deal tests (built from canonical deck order). */
export function canonicalDeckIds(): string[] {
  const suits = ["S", "H", "D", "C"];
  const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
  const ids: string[] = [];
  for (const r of ranks) for (const s of suits) ids.push(`${s}${r}`);
  ids.push("JOKER_BLACK", "JOKER_RED");
  return ids;
}
