/**
 * Beating rules (SPEC §4.5).
 */
import type { ClassifiedCombo } from "./combinations";

/**
 * Returns true if candidate legally beats the current table combo.
 * current === null means the table is open (leader may play anything legal).
 */
export function beats(candidate: ClassifiedCombo, current: ClassifiedCombo | null): boolean {
  if (current === null) return true;

  const candBomb = candidate.type === "bomb";
  const currBomb = current.type === "bomb";

  // Bomb beats any non-bomb.
  if (candBomb && !currBomb) return true;
  if (!candBomb && currBomb) return false;
  if (candBomb && currBomb) {
    // Higher four-of-a-kind wins; equal does not beat.
    return candidate.strength > current.strength;
  }

  // Normal responses: same type, same card count, strictly stronger.
  if (candidate.type !== current.type) return false;
  if (candidate.length !== current.length) return false;
  return candidate.strength > current.strength;
}
