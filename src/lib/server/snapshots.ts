/**
 * Public/private snapshot projection (SPEC §5).
 * Server-only: strips hidden hands before sending to clients.
 */
import { teamTotalsFromScores } from "../game/scoring";
import type { MatchState, PrivateSnapshot, PublicSnapshot, Seat } from "../game/state";

export interface SeatMeta {
  displayName: string;
  team: 0 | 1 | null;
  connected: boolean;
  isBot: boolean;
}

export function toPublicSnapshot(
  state: MatchState,
  seats: [SeatMeta, SeatMeta, SeatMeta, SeatMeta],
): PublicSnapshot {
  const teamTotals = state.mode === "2v2" ? teamTotalsFromScores([...state.scores]) : null;
  return {
    matchId: state.matchId,
    roomId: state.roomId,
    version: state.version,
    status: state.status,
    mode: state.mode,
    handNumber: state.handNumber,
    target: state.target,
    scores: [...state.scores] as [number, number, number, number],
    teamTotals,
    seats: ([0, 1, 2, 3] as Seat[]).map((s) => ({
      seat: s,
      displayName: seats[s].displayName,
      team: seats[s].team,
      connected: seats[s].connected,
      isBot: seats[s].isBot,
      cardsRemaining: state.hands[s].length,
      score: state.scores[s],
      passed: state.passed[s],
      finished: state.finished[s],
      placement: state.placements[s],
      isTurn: state.currentActor === s,
    })),
    currentActor: state.currentActor,
    currentCombo: state.currentCombo
      ? {
          type: state.currentCombo.type,
          cardIds: [...state.currentCombo.cardIds],
          playedBy: state.currentComboBy as Seat,
        }
      : null,
    history: state.history.slice(-6).map((h) => ({ ...h, cardIds: [...h.cardIds] })),
    isFirstHand: state.isFirstHand,
    openingPending: state.openingPending,
    exchange: state.exchange
      ? {
          firstSeat: state.exchange.firstSeat,
          fourthSeat: state.exchange.fourthSeat,
          receivedCardId: state.exchange.resolved ? null : state.exchange.receivedCardId,
          needsReturnFrom: state.exchange.resolved ? null : state.exchange.firstSeat,
        }
      : null,
    placements:
      state.status === "finished" || state.status === "handResult"
        ? ([...state.placements] as [number, number, number, number])
        : null,
    lastHandPlacements: state.lastHandPlacements
      ? ([...state.lastHandPlacements] as [number, number, number, number])
      : null,
    winner: state.winner,
    tie: state.tie,
    tied: [...state.tied],
    nextLeader: state.nextLeader,
  };
}

export function toPrivateSnapshot(
  state: MatchState,
  seats: [SeatMeta, SeatMeta, SeatMeta, SeatMeta],
  mySeat: Seat | null,
  isHost = false,
): PrivateSnapshot {
  const pub = toPublicSnapshot(state, seats);
  const myCards =
    mySeat === null
      ? []
      : state.hands[mySeat].map((c) => ({
          id: c.id,
          rank: c.rank,
          suit: c.suit,
          isJoker: c.isJoker,
        }));
  return {
    ...pub,
    mySeat,
    myCards,
    canAct: mySeat !== null && state.currentActor === mySeat && state.status === "playing",
    isHost,
  };
}
