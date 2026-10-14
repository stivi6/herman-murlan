/**
 * Core turn/phase transitions (SPEC §4.5–§4.9).
 * Pure: (state, action) -> new state or RuleError. No randomness, no I/O.
 * Dealing/shuffle is injected by the caller (server) via startHandWithHands().
 */
import { cardFromId, S3_ID, type Card } from "./cards";
import { classifyCombination, type ClassifiedCombo } from "./combinations";
import { beats } from "./compare";
import { err, ok, type EngineResult } from "./errors";
import { planExchange, validateExchangeReturn } from "./exchange";
import {
  applyFfaHandScores,
  evaluateMatchEnd,
  teamTotalsFromScores,
  type RoomMode,
} from "./scoring";
import {
  resetForNewHand,
  type MatchState,
  type Seat,
} from "./state";

export type PlayAction = { type: "play"; seat: Seat; cardIds: string[] };
export type PassAction = { type: "pass"; seat: Seat };
export type ExchangeSelectAction = { type: "exchangeSelect"; seat: Seat; cardId: string };
export type GameAction = PlayAction | PassAction | ExchangeSelectAction;

function activeSeats(state: MatchState): Seat[] {
  const out: Seat[] = [];
  for (let s = 0; s < 4; s++) {
    if (!state.finished[s as Seat]) out.push(s as Seat);
  }
  return out;
}

function nextSeatClockwise(from: Seat, candidates: Seat[]): Seat {
  for (let step = 1; step <= 4; step++) {
    const s = ((from + step) % 4) as Seat;
    if (candidates.includes(s)) return s;
  }
  return from;
}

/** Next actor skipping finished AND currently-passed seats. */
function nextUnpassedActor(state: MatchState, from: Seat): Seat | null {
  for (let step = 1; step <= 4; step++) {
    const s = ((from + step) % 4) as Seat;
    if (!state.finished[s] && !state.passed[s]) return s;
  }
  return null;
}

function allOtherActivePassed(state: MatchState, lastSuccessful: Seat): boolean {
  for (const s of activeSeats(state)) {
    if (s === lastSuccessful) continue;
    if (!state.passed[s]) return false;
  }
  return true;
}

function handOf(state: MatchState, seat: Seat): Card[] {
  return state.hands[seat];
}

function removeCards(hand: Card[], ids: Set<string>): Card[] {
  return hand.filter((c) => !ids.has(c.id));
}

function cloneHands(hands: [Card[], Card[], Card[], Card[]]): [Card[], Card[], Card[], Card[]] {
  return [ [...hands[0]], [...hands[1]], [...hands[2]], [...hands[3]] ];
}

/**
 * Begin a hand with already-shuffled+dealt hands (server dealt them).
 * Determines opening leader: S3 holder on first hand, else nextLeader/param.
 */
export function startHandWithHands(
  state: MatchState,
  hands: [Card[], Card[], Card[], Card[]],
  opts: { handNumber: number; isFirstHand: boolean; forcedLeader?: Seat },
): MatchState {
  let leader: Seat;
  if (opts.isFirstHand) {
    leader = 0;
    for (let s = 0; s < 4; s++) {
      if (hands[s as Seat].some((c) => c.id === S3_ID)) {
        leader = s as Seat;
        break;
      }
    }
  } else {
    leader = opts.forcedLeader ?? 0;
  }
  return resetForNewHand(state, hands, leader, opts.handNumber, opts.isFirstHand);
}

function recordFinish(
  state: MatchState,
  seat: Seat,
): Pick<MatchState, "finished" | "placements" | "finishOrder"> {
  const finished = [...state.finished] as [boolean, boolean, boolean, boolean];
  const placements = [...state.placements] as [number, number, number, number];
  const finishOrder = [...state.finishOrder];
  if (!finished[seat]) {
    finished[seat] = true;
    finishOrder.push(seat);
    placements[seat] = finishOrder.length; // 1..4
  }
  return { finished, placements, finishOrder };
}

function endHandAndScore(
  state: MatchState,
): EngineResult<MatchState> {
  // Called when 3 players finished; the remaining active player is 4th.
  const remaining = activeSeats(state);
  const finished = [...state.finished] as [boolean, boolean, boolean, boolean];
  const placements = [...state.placements] as [number, number, number, number];
  const finishOrder = [...state.finishOrder];
  if (remaining.length === 1) {
    const last = remaining[0];
    finished[last] = true;
    finishOrder.push(last);
    placements[last] = 4;
  } else if (remaining.length !== 0) {
    return err("MATCH_FINISHED", "Hand end called without three finishers.");
  }

  const nextScores = applyFfaHandScores([...state.scores], [...placements]);
  const scoreTuple = nextScores as [number, number, number, number];

  // Match-end evaluation (FFA uses player totals; 2v2 uses team totals).
  let totalsForEval: number[];
  if (state.mode === "ffa") totalsForEval = scoreTuple;
  else totalsForEval = [...teamTotalsFromScores(scoreTuple)];

  const evalResult = evaluateMatchEnd(totalsForEval, state.target);

  if (evalResult.finished) {
    const winner =
      state.mode === "ffa"
        ? (evalResult.winner as Seat | null)
        : (evalResult.winner as 0 | 1 | null);
    const next: MatchState = {
      ...state,
      finished,
      placements,
      finishOrder,
      scores: scoreTuple,
      status: "finished",
      currentActor: null,
      currentCombo: null,
      winner,
      tie: evalResult.tie,
      tied: evalResult.tied,
      lastHandPlacements: placements,
      version: state.version + 1,
    };
    return ok(next);
  }

  if (evalResult.nextTarget !== state.target) {
    // Target extended; continue to exchange/new hand with new target.
    const next: MatchState = {
      ...state,
      finished,
      placements,
      finishOrder,
      scores: scoreTuple,
      target: evalResult.nextTarget,
      status: "handResult",
      currentActor: null,
      lastHandPlacements: placements,
      version: state.version + 1,
    };
    return ok(next);
  }

  const next: MatchState = {
    ...state,
    finished,
    placements,
    finishOrder,
    scores: scoreTuple,
    status: "handResult",
    currentActor: null,
    lastHandPlacements: placements,
    version: state.version + 1,
  };
  return ok(next);
}

/**
 * After handResult, the server deals new hands and calls this to set up
 * the exchange phase (or skip straight to playing when both-jokers rule hits).
 * dealtHands: freshly dealt hands for the NEXT hand.
 */
export function setupNextHandExchange(
  state: MatchState,
  dealtHands: [Card[], Card[], Card[], Card[]],
): EngineResult<MatchState> {
  if (state.status !== "handResult") {
    return err("NOT_PLAYING", "Exchange setup requires a completed hand.");
  }
  // Previous hand placements determine first (1st) and fourth (4th).
  const placeOf = (place: number): Seat => {
    for (let s = 0; s < 4; s++) if (state.placements[s as Seat] === place) return s as Seat;
    throw new Error(`No seat with placement ${place}`);
  };
  const first = placeOf(1);
  const fourth = placeOf(4);
  const plan = planExchange(dealtHands[fourth]);

  if (!plan.swap || !plan.fourthGivesId) {
    // No-swap: next hand opens immediately with previous first-place leading.
    const opened = resetForNewHand(
      state,
      dealtHands,
      first,
      state.handNumber + 1,
      false,
    );
    return ok({ ...opened, nextLeader: first });
  }

  // Move the 4th's highest card into the 1st's hand; wait for return selection.
  const receivedId = plan.fourthGivesId;
  const hands = cloneHands(dealtHands);
  const idx = hands[fourth].findIndex((c) => c.id === receivedId);
  if (idx < 0) return err("CARDS_NOT_IN_HAND", "Exchange card missing.");
  const [moved] = hands[fourth].splice(idx, 1);
  hands[first].push(moved);

  const next: MatchState = {
    ...resetForNewHand(state, hands, fourth, state.handNumber + 1, false),
    status: "exchange",
    currentActor: first, // first-place acts (chooses return card)
    nextLeader: fourth, // fourth opens once exchange resolves
    exchange: {
      firstSeat: first,
      fourthSeat: fourth,
      receivedCardId: receivedId,
      swap: true,
      resolved: false,
    },
  };
  return ok(next);
}

export function applyAction(state: MatchState, action: GameAction): EngineResult<MatchState> {
  if (state.status === "finished" || state.status === "cancelled") {
    return err("MATCH_FINISHED", "The match is already over.");
  }

  if (action.type === "exchangeSelect") {
    return applyExchangeSelect(state, action.seat, action.cardId);
  }

  if (state.status !== "playing") {
    return err("NOT_PLAYING", "The game is not accepting plays right now.");
  }

  if (action.seat < 0 || action.seat > 3) return err("INVALID_SEAT", "Invalid seat.");
  if (state.finished[action.seat]) return err("SEAT_FINISHED", "That player has already finished.");
  if (state.currentActor === null) return err("NOT_PLAYING", "No active turn.");
  if (action.seat !== state.currentActor) {
    return err("NOT_YOUR_TURN", "Wait for your turn.");
  }

  if (action.type === "pass") return applyPass(state, action.seat);
  return applyPlay(state, action.seat, action.cardIds);
}

function applyPass(state: MatchState, seat: Seat): EngineResult<MatchState> {
  if (state.passed[seat]) return err("ALREADY_PASSED", "You already passed this trick.");
  if (state.currentCombo === null) {
    return err("PASS_NOT_ALLOWED_LEAD", "You lead this trick — play a combination.");
  }
  const passed = [...state.passed] as [boolean, boolean, boolean, boolean];
  passed[seat] = true;

  // Trick end? All other active players passed.
  if (state.lastSuccessfulSeat !== null && allOtherActivePassed({ ...state, passed }, state.lastSuccessfulSeat)) {
    return ok(resetTrick(state, passed));
  }

  const nextActor = nextUnpassedActor({ ...state, passed }, seat);
  if (nextActor === null) {
    // Should not happen if lastSuccessful logic is right, but fail safe: reset trick.
    return ok(resetTrick(state, passed));
  }
  return ok({ ...state, passed, currentActor: nextActor, version: state.version + 1 });
}

/** Reset trick to the last successful player (or next active if they finished). */
function resetTrick(
  state: MatchState,
  passedBeforeReset: [boolean, boolean, boolean, boolean],
): MatchState {
  void passedBeforeReset;
  const cleared: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  let leader = state.lastSuccessfulSeat;
  if (leader === null || state.finished[leader]) {
    // Finished leader: next still-active player clockwise.
    const start = state.lastSuccessfulSeat ?? state.currentActor ?? 0;
    const actives = activeSeats(state);
    leader = nextSeatClockwise(start, actives);
  }
  // History: keep last play visible in history; clear active combo.
  // (Played cards accumulate here so the 54-card invariant holds; UI shows recent few.)
  const history = state.currentCombo
    ? [...state.history, { type: state.currentCombo.type, cardIds: state.currentCombo.cardIds, playedBy: state.currentComboBy as Seat }]
    : state.history;
  return {
    ...state,
    passed: cleared,
    currentCombo: null,
    currentComboBy: null,
    lastSuccessfulSeat: null,
    currentActor: leader,
    history,
    version: state.version + 1,
  };
}

function applyPlay(state: MatchState, seat: Seat, cardIds: string[]): EngineResult<MatchState> {
  if (cardIds.length === 0) return err("EMPTY_SELECTION", "Select cards to play.");
  // Ownership check.
  const owned = new Set(handOf(state, seat).map((c) => c.id));
  for (const id of cardIds) {
    if (!owned.has(id)) return err("CARDS_NOT_IN_HAND", "Selected cards are not in your hand.");
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return err("INVALID_COMBINATION", "Duplicate cards selected.");
  }
  const cards = cardIds.map(cardFromId);
  const classified = classifyCombination(cards);
  if (!classified.ok) return classified as EngineResult<MatchState>;
  const combo: ClassifiedCombo = classified.value;

  // First-hand S3 rule.
  if (state.isFirstHand && state.openingPending) {
    if (!cardIds.includes(S3_ID)) {
      return err("MUST_INCLUDE_S3", "The opening play must include 3♠.");
    }
  }

  // Must beat current table combo.
  if (!beats(combo, state.currentCombo)) {
    if (state.currentCombo === null) {
      return err("INVALID_COMBINATION", "That combination cannot be played.");
    }
    return err("DOES_NOT_BEAT", "That combination does not beat the current play.");
  }

  // Apply removal.
  const ids = new Set(cardIds);
  const hands = cloneHands(state.hands);
  hands[seat] = removeCards(hands[seat], ids);

  let finished = [...state.finished] as [boolean, boolean, boolean, boolean];
  let placements = [...state.placements] as [number, number, number, number];
  let finishOrder = [...state.finishOrder];
  const wentOut = hands[seat].length === 0;
  if (wentOut) {
    const rec = recordFinish({ ...state, finished, placements, finishOrder }, seat);
    finished = rec.finished;
    placements = rec.placements;
    finishOrder = rec.finishOrder;
  }

  const historyEntry = {
    type: combo.type,
    cardIds: combo.cardIds,
    playedBy: seat,
  } as const;
  // Archive the beaten table combo so hands + history + currentCombo always
  // account for all 54 cards. History is kept uncapped in authoritative state
  // (max 54 entries — tiny); the UI/snapshot layer shows only the recent few.
  const archived = state.currentCombo
    ? [
        ...state.history,
        {
          type: state.currentCombo.type,
          cardIds: state.currentCombo.cardIds,
          playedBy: state.currentComboBy as Seat,
        },
      ]
    : state.history;

  // Hand end? Three (or four via this play) finished.
  // NB: currentCombo keeps the final play's cards, so history takes only the
  // archived (beaten) combos — otherwise cards would be double-counted.
  const finishedCount = finishOrder.length;
  if (finishedCount >= 3) {
    const interim: MatchState = {
      ...state,
      hands,
      finished,
      placements,
      finishOrder,
      currentCombo: combo,
      currentComboBy: seat,
      lastSuccessfulSeat: seat,
      history: archived,
      openingPending: false,
    };
    return endHandAndScore(interim);
  }

  // Normal play: update table, lastSuccessful, opening cleared.
  const afterPlay: MatchState = {
    ...state,
    hands,
    finished,
    placements,
    finishOrder,
    currentCombo: combo,
    currentComboBy: seat,
    lastSuccessfulSeat: seat,
    openingPending: false,
    history: archived,
  };

  // Trick end check: every other active player passed -> reset to this player
  // (they lead again) unless they just went out — then next active leads.
  if (allOtherActivePassed(afterPlay, seat)) {
    if (wentOut) {
      // Winner went out and everyone else passed: next active leads fresh.
      const cleared: [boolean, boolean, boolean, boolean] = [false, false, false, false];
      const actives = activeSeats(afterPlay);
      const leader = nextSeatClockwise(seat, actives);
      return ok({
        ...afterPlay,
        passed: cleared,
        currentCombo: null,
        currentComboBy: null,
        lastSuccessfulSeat: null,
        currentActor: leader,
        history: [...archived, { ...historyEntry }],
        version: state.version + 1,
      });
    }
    const cleared: [boolean, boolean, boolean, boolean] = [false, false, false, false];
    return ok({
      ...afterPlay,
      passed: cleared,
      currentCombo: null,
      currentComboBy: null,
      lastSuccessfulSeat: null,
      currentActor: seat,
      history: [...archived, { ...historyEntry }],
      version: state.version + 1,
    });
  }

  // Otherwise advance to next unpassed, unfinished player.
  const nextActor = nextUnpassedActor(afterPlay, seat);
  if (nextActor === null) {
    // Defensive: treat as trick reset.
    return ok(resetTrick(afterPlay, afterPlay.passed));
  }
  return ok({ ...afterPlay, currentActor: nextActor, version: state.version + 1 });
}

function applyExchangeSelect(
  state: MatchState,
  seat: Seat,
  cardId: string,
): EngineResult<MatchState> {
  if (state.status !== "exchange" || !state.exchange) {
    return err("NOT_IN_EXCHANGE", "No card exchange is pending.");
  }
  const ex = state.exchange;
  if (seat !== ex.firstSeat) return err("WRONG_EXCHANGE_SEAT", "Only the hand winner gives a card.");
  const firstHand = state.hands[ex.firstSeat];
  const fourthSeat = ex.fourthSeat;
  const withReceived = [...firstHand];
  const check = validateExchangeReturn(withReceived, ex.receivedCardId, cardId);
  if (!check.ok) {
    const msg = "message" in check ? check.message : "Invalid exchange card.";
    return err("EXCHANGE_RANK_RESTRICTED", msg);
  }
  // Swap: remove return card from first, give to fourth.
  const hands = cloneHands(state.hands);
  const idx = hands[ex.firstSeat].findIndex((c) => c.id === cardId);
  if (idx < 0) return err("EXCHANGE_CARD_NOT_OWNED", "Card not in hand.");
  const [ret] = hands[ex.firstSeat].splice(idx, 1);
  hands[fourthSeat].push(ret);

  const leader = state.nextLeader ?? fourthSeat;
  const next: MatchState = {
    ...state,
    hands,
    status: "playing",
    currentActor: leader,
    lastSuccessfulSeat: null,
    currentCombo: null,
    currentComboBy: null,
    passed: [false, false, false, false],
    exchange: { ...ex, resolved: true },
    version: state.version + 1,
  };
  return ok(next);
}

/** All legal plays from a hand that beat the table (or any legal play when open). */
export function legalPlaysFromHand(hand: Card[], table: ClassifiedCombo | null): ClassifiedCombo[] {
  const out: ClassifiedCombo[] = [];
  const byRank = new Map<string, Card[]>();
  for (const c of hand) {
    const k = c.isJoker ? (c.jokerKind === "RED" ? "JOKER_RED" : "JOKER_BLACK") : c.rank;
    if (!byRank.has(k)) byRank.set(k, []);
    byRank.get(k)!.push(c);
  }
  const tryAdd = (cards: Card[]) => {
    const r = classifyCombination(cards);
    if (r.ok && beats(r.value, table)) out.push(r.value);
  };
  // Singles.
  for (const c of hand) tryAdd([c]);
  // Pairs / triples / bombs.
  for (const [, group] of byRank) {
    if (group[0].isJoker) continue;
    if (group.length >= 2) tryAdd(group.slice(0, 2));
    if (group.length >= 3) tryAdd(group.slice(0, 3));
    if (group.length >= 4) tryAdd(group.slice(0, 4));
  }
  // Scales: sliding windows over sorted unique normal ranks present in hand.
  const ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const present = new Set<string>();
  const repByRank = new Map<string, Card>();
  for (const c of hand) {
    if (c.isJoker || c.rank === "2") continue;
    if (!present.has(c.rank)) {
      present.add(c.rank);
      repByRank.set(c.rank, c);
    }
  }
  for (let len = 5; len <= ORDER.length; len++) {
    for (let start = 0; start + len <= ORDER.length; start++) {
      const window = ORDER.slice(start, start + len);
      if (window.every((r) => present.has(r))) {
        tryAdd(window.map((r) => repByRank.get(r)!));
      }
    }
  }
  // Low A,2,3,4,5 scale.
  const need = ["A", "2", "3", "4", "5"];
  const reps: Card[] = [];
  let hasAll = true;
  for (const r of need) {
    const found = hand.find((c) => !c.isJoker && c.rank === r && !reps.includes(c));
    if (!found) {
      hasAll = false;
      break;
    }
    reps.push(found);
  }
  if (hasAll) tryAdd(reps);
  return out;
}

export type { RoomMode };
