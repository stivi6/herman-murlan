/**
 * Structured rule errors (SPEC §4 + §5).
 * The engine returns these instead of throwing for expected rule violations.
 */

export type RuleErrorCode =
  | "NOT_YOUR_TURN"
  | "NOT_PLAYING"
  | "SEAT_FINISHED"
  | "ALREADY_PASSED"
  | "PASS_NOT_ALLOWED_LEAD"
  | "CARDS_NOT_IN_HAND"
  | "EMPTY_SELECTION"
  | "INVALID_COMBINATION"
  | "DOES_NOT_BEAT"
  | "MUST_INCLUDE_S3"
  | "NOT_IN_EXCHANGE"
  | "EXCHANGE_CARD_NOT_OWNED"
  | "EXCHANGE_RANK_RESTRICTED"
  | "WRONG_EXCHANGE_SEAT"
  | "MATCH_FINISHED"
  | "INVALID_SEAT"
  | "STALE_STATE";

export interface RuleError {
  code: RuleErrorCode;
  message: string;
}

export function ruleError(code: RuleErrorCode, message: string): RuleError {
  return { code, message };
}

export type EngineResult<T> = { ok: true; value: T } | { ok: false; error: RuleError };

export function ok<T>(value: T): EngineResult<T> {
  return { ok: true, value };
}

export function err<T>(code: RuleErrorCode, message: string): EngineResult<T> {
  return { ok: false, error: ruleError(code, message) };
}
