/**
 * Scoring + target extension (SPEC §4.9).
 * Pure functions.
 */

export type RoomMode = "ffa" | "2v2";

export const INITIAL_TARGET = 21;
export const TARGET_CAP = 51;
export const TARGET_SEQUENCE = [21, 31, 41, 51] as const;

/** Placement points: 1st=3, 2nd=2, 3rd=1, 4th=0. Index = placement-1. */
export const PLACEMENT_POINTS = [3, 2, 1, 0] as const;

export function pointsForPlacement(place: 1 | 2 | 3 | 4): number {
  return PLACEMENT_POINTS[place - 1];
}

/** Team of a canonical seat in 2v2: seat 0+2 = team 0, seat 1+3 = team 1. */
export function teamOfSeat(seat: number): 0 | 1 {
  return seat % 2 === 0 ? 0 : 1;
}

export interface MatchEndEvaluation {
  finished: boolean;
  /** Winning player seat (FFA) or team index (2v2), when exactly one side qualifies. */
  winner: number | null;
  tie: boolean;
  /** Tied seats/teams at cap. */
  tied: number[];
  /** New target after extension (when not finished). */
  nextTarget: number;
}

/**
 * Evaluate match end after hand points are applied.
 * totals: per-player totals (FFA) or per-team totals (2v2, length 2).
 */
export function evaluateMatchEnd(totals: number[], currentTarget: number): MatchEndEvaluation {
  const qualified = totals
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t >= currentTarget)
    .map((x) => x.i);

  if (qualified.length === 0) {
    return { finished: false, winner: null, tie: false, tied: [], nextTarget: currentTarget };
  }
  if (qualified.length === 1) {
    return { finished: true, winner: qualified[0], tie: false, tied: [], nextTarget: currentTarget };
  }
  // Two or more at/above target: extend target by 10 up to 51.
  if (currentTarget < TARGET_CAP) {
    const nextTarget = Math.min(currentTarget + 10, TARGET_CAP) as number;
    return { finished: false, winner: null, tie: false, tied: [], nextTarget };
  }
  // At cap 51: highest wins; tie if highest equal.
  const best = Math.max(...totals);
  const leaders = totals.map((t, i) => ({ t, i })).filter((x) => x.t === best).map((x) => x.i);
  // Only sides at/above 51 are eligible per spec fallback.
  const eligible = leaders.filter((i) => totals[i] >= TARGET_CAP);
  if (eligible.length === 1) {
    return { finished: true, winner: eligible[0], tie: false, tied: [], nextTarget: currentTarget };
  }
  return { finished: true, winner: null, tie: true, tied: eligible, nextTarget: currentTarget };
}

/** Apply placement points to cumulative player scores (FFA). placements[seat] = 1..4. */
export function applyFfaHandScores(scores: number[], placements: number[]): number[] {
  const next = [...scores];
  for (let seat = 0; seat < 4; seat++) {
    const place = placements[seat] as 1 | 2 | 3 | 4;
    next[seat] += pointsForPlacement(place);
  }
  return next;
}

/** Team totals from player scores in 2v2. */
export function teamTotalsFromScores(scores: number[]): [number, number] {
  return [scores[0] + scores[2], scores[1] + scores[3]];
}

/** Team hand points from per-seat placements in 2v2. */
export function teamHandPoints(placements: number[]): [number, number] {
  let t0 = 0;
  let t1 = 0;
  for (let seat = 0; seat < 4; seat++) {
    const pts = pointsForPlacement(placements[seat] as 1 | 2 | 3 | 4);
    if (teamOfSeat(seat) === 0) t0 += pts;
    else t1 += pts;
  }
  return [t0, t1];
}
