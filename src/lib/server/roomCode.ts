/**
 * Room codes: 6 chars, unambiguous alphabet (no 0/O, 1/I), random non-sequential.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  // Uses Math.random only for lobby codes (not game shuffling); uniqueness enforced by DB.
  const chars: string[] = [];
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++) {
    chars.push(ALPHABET[bytes[i] % ALPHABET.length]);
  }
  return chars.join("");
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, "");
}
