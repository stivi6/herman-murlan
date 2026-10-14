/**
 * Authoritative match state + public snapshot (SPEC §5).
 * Pure types + invariant checks. No I/O.
 */
import type { Card } from "./cards";
import type { ClassifiedCombo } from "./combinations";
import { INITIAL_TARGET, type RoomMode } from "./scoring";

export const STATE_SCHEMA_VERSION = 1;

export type GameStatus = "playing" | "exchange" | "handResult" | "finished" | "cancelled";

export type Seat = 0 | 1 | 2 | 3;

export interface ExchangeState {
  firstSeat: Seat;
  fourthSeat: Seat;
  /** Highest card auto-taken from 4th (now held by 1st pending return). */
  receivedCardId: string;
  /** Whether swap applies (false only in both-jokers case, which skips exchange status). */
  swap: boolean;
  /** True once the return card is chosen. */
  resolved: boolean;
}

export interface PublicComboView {
  type: ClassifiedCombo["type"];
  cardIds: string[];
  playedBy: Seat;
}

export interface MatchState {
  schemaVersion: number;
  matchId: string;
  roomId: string;
  mode: RoomMode;
  handNumber: number;
  status: GameStatus;
  target: number;
  /** Cumulative player scores. */
  scores: [number, number, number, number];
  /** Private hands (server-only). */
  hands: [Card[], Card[], Card[], Card[]];
  /** First hand of the match? (forces S3 opening). */
  isFirstHand: boolean;
  /** Whether the S3 opening is still pending (first trick of first hand). */
  openingPending: boolean;
  currentActor: Seat | null;
  lastSuccessfulSeat: Seat | null;
  currentCombo: ClassifiedCombo | null;
  currentComboBy: Seat | null;
  /** Passed markers for the current trick. */
  passed: [boolean, boolean, boolean, boolean];
  /** finished[seat] = player has emptied hand. */
  finished: [boolean, boolean, boolean, boolean];
  /** placements[seat] = 1..4 once finished, else 0. */
  placements: [number, number, number, number];
  /** Seats in finish order. */
  finishOrder: Seat[];
  /** Next-hand leader seat (set at hand end). */
  nextLeader: Seat | null;
  exchange: ExchangeState | null;
  version: number;
  /** Recent public plays this hand (for history UI). Capped server-side. */
  history: PublicComboView[];
  /** Winner seat (FFA) or team (2v2) at match end; tied list when tie. */
  winner: number | null;
  tie: boolean;
  tied: number[];
  /** Last hand placements for result overlay. */
  lastHandPlacements: [number, number, number, number] | null;
}

export interface PublicSeatView {
  seat: Seat;
  displayName: string;
  team: 0 | 1 | null;
  connected: boolean;
  isBot: boolean;
  cardsRemaining: number;
  score: number;
  passed: boolean;
  finished: boolean;
  placement: number;
  isTurn: boolean;
}

export interface PublicSnapshot {
  matchId: string;
  roomId: string;
  version: number;
  status: GameStatus;
  mode: RoomMode;
  handNumber: number;
  target: number;
  scores: [number, number, number, number];
  teamTotals: [number, number] | null;
  seats: PublicSeatView[];
  currentActor: Seat | null;
  currentCombo: PublicComboView | null;
  history: PublicComboView[];
  isFirstHand: boolean;
  openingPending: boolean;
  exchange: {
    firstSeat: Seat;
    fourthSeat: Seat;
    receivedCardId: string | null;
    needsReturnFrom: Seat | null;
  } | null;
  placements: [number, number, number, number] | null;
  lastHandPlacements: [number, number, number, number] | null;
  winner: number | null;
  tie: boolean;
  tied: number[];
  nextLeader: Seat | null;
}

/** Per-requester private view: public snapshot + own cards + UI flags. */
export interface PrivateSnapshot extends PublicSnapshot {
  mySeat: Seat | null;
  myCards: { id: string; rank: string; suit: string | null; isJoker: boolean }[];
  canAct: boolean;
  isHost: boolean;
}

export function createInitialMatchState(args: {
  matchId: string;
  roomId: string;
  mode: RoomMode;
}): MatchState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    matchId: args.matchId,
    roomId: args.roomId,
    mode: args.mode,
    handNumber: 0,
    status: "playing",
    target: INITIAL_TARGET,
    scores: [0, 0, 0, 0],
    hands: [[], [], [], []] as unknown as [Card[], Card[], Card[], Card[]],
    isFirstHand: true,
    openingPending: true,
    currentActor: null,
    lastSuccessfulSeat: null,
    currentCombo: null,
    currentComboBy: null,
    passed: [false, false, false, false],
    finished: [false, false, false, false],
    placements: [0, 0, 0, 0],
    finishOrder: [],
    nextLeader: null,
    exchange: null,
    version: 0,
    history: [],
    winner: null,
    tie: false,
    tied: [],
    lastHandPlacements: null,
  };
}

/** Start a new hand inside an existing match state (hands must already be set by caller). */
export function resetForNewHand(
  state: MatchState,
  hands: [Card[], Card[], Card[], Card[]],
  leader: Seat,
  handNumber: number,
  isFirstHand: boolean,
): MatchState {
  return {
    ...state,
    hands,
    handNumber,
    status: "playing",
    isFirstHand,
    openingPending: isFirstHand,
    currentActor: leader,
    lastSuccessfulSeat: null,
    currentCombo: null,
    currentComboBy: null,
    passed: [false, false, false, false],
    finished: [false, false, false, false],
    placements: [0, 0, 0, 0],
    finishOrder: [],
    nextLeader: null,
    exchange: null,
    history: [],
    version: state.version + 1,
  };
}

export function assertInvariants(state: MatchState): string[] {
  const problems: string[] = [];
  // 54-card accounting during active hand (playing/exchange with hands dealt).
  if (state.status === "playing" || state.status === "exchange" || state.status === "handResult") {
    const seen = new Set<string>();
    let dup = false;
    let total = 0;
    for (const hand of state.hands) {
      for (const c of hand) {
        total++;
        if (seen.has(c.id)) dup = true;
        seen.add(c.id);
      }
    }
    for (const h of state.history) {
      for (const id of h.cardIds) {
        total++;
        if (seen.has(id)) dup = true;
        seen.add(id);
      }
    }
    if (state.currentCombo) {
      for (const id of state.currentCombo.cardIds) {
        // currentCombo cards are also in history's last entry in our implementation?
        // We keep them separate: history holds previous plays, currentCombo the active one.
        total++;
        if (seen.has(id)) dup = true;
        seen.add(id);
      }
    }
    if (dup) problems.push("duplicate card IDs across locations");
    // Note: total may be < 54 in handResult after placements recorded? Hands empty progressively.
    // Full accounting: hands + history + currentCombo should equal 54 while hand active.
    if ((state.status === "playing" || state.status === "exchange") && total !== 54) {
      problems.push(`card accounting: expected 54, got ${total}`);
    }
  }
  if (![21, 31, 41, 51].includes(state.target)) problems.push(`invalid target ${state.target}`);
  const finishedCount = state.finishOrder.length;
  if (new Set(state.finishOrder).size !== finishedCount) problems.push("duplicate finish order");
  for (const s of state.finishOrder) {
    if (!state.finished[s]) problems.push(`finishOrder has unfinished seat ${s}`);
  }
  if (state.currentActor !== null && state.finished[state.currentActor]) {
    problems.push("current actor is finished");
  }
  if (
    state.currentActor !== null &&
    state.status === "playing" &&
    state.passed[state.currentActor]
  ) {
    problems.push("current actor is passed");
  }
  return problems;
}
