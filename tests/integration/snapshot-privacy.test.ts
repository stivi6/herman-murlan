import { describe, expect, it } from "vitest";
import { toPrivateSnapshot, toPublicSnapshot, type SeatMeta } from "@/lib/server/snapshots";
import { testStateWithHands } from "@/lib/game/fixtures";
import { applyAction } from "@/lib/game/transitions";
import type { Seat } from "@/lib/game/state";

const SEATS: [SeatMeta, SeatMeta, SeatMeta, SeatMeta] = [0, 1, 2, 3].map((s) => ({
  displayName: `P${s}`,
  team: null,
  connected: true,
  isBot: false,
})) as [SeatMeta, SeatMeta, SeatMeta, SeatMeta];

function leakCheck(payload: unknown, forbidden: string[]): string[] {
  const text = JSON.stringify(payload);
  return forbidden.filter((id) => text.includes(`"${id}"`));
}

describe("snapshot privacy (SPEC §5)", () => {
  it("public snapshot exposes no private hands", () => {
    const st = testStateWithHands(
      [
        ["S3", "H4", "D5"],
        ["S6", "H7", "D8"],
        ["S9", "H10", "DJ"],
        ["SQ", "HK", "DA"],
      ],
      0,
    );
    const pub = toPublicSnapshot(st, SEATS);
    const text = JSON.stringify(pub);
    // No private card IDs anywhere in the public snapshot.
    for (const id of ["S3", "H4", "D5", "S6", "H7", "D8", "S9", "H10", "DJ", "SQ", "HK", "DA"]) {
      expect(text).not.toContain(id);
    }
    expect(pub.seats.map((s) => s.cardsRemaining)).toEqual([3, 3, 3, 3]);
  });

  it("private snapshot adds only the requester's own cards", () => {
    const st = testStateWithHands(
      [
        ["S3", "H4", "D5"],
        ["S6", "H7", "D8"],
        ["S9", "H10", "DJ"],
        ["SQ", "HK", "DA"],
      ],
      0,
    );
    const priv = toPrivateSnapshot(st, SEATS, 1 as Seat);
    expect(priv.mySeat).toBe(1);
    expect(priv.myCards.map((c) => c.id).sort()).toEqual(["D8", "H7", "S6"]);
    // Opponents' cards still hidden.
    expect(leakCheck(priv, ["S3", "S9", "SQ"])).toEqual([]);
  });

  it("after a play, the public snapshot shows only the played cards face-up", () => {
    let st = testStateWithHands(
      [
        ["S3", "SA"],
        ["S5", "SK"],
        ["S7", "SQ"],
        ["S9", "SJ"],
      ],
      0,
    );
    const r = applyAction(st, { type: "play", seat: 0, cardIds: ["S3"] });
    if (!r.ok) throw new Error("play failed");
    st = r.value;
    const pub = toPublicSnapshot(st, SEATS);
    expect(pub.currentCombo?.cardIds).toEqual(["S3"]);
    // SA (still in seat 0's hand) and all other hidden cards stay hidden.
    expect(leakCheck(pub, ["SA", "S5", "SK", "S7", "SQ", "S9", "SJ"])).toEqual([]);
  });

  it("null-seat (spectator-shaped) private snapshot carries no cards", () => {
    const st = testStateWithHands(
      [
        ["S3"],
        ["S5"],
        ["S7"],
        ["S9"],
      ],
      0,
    );
    const priv = toPrivateSnapshot(st, SEATS, null);
    expect(priv.myCards).toEqual([]);
    expect(priv.canAct).toBe(false);
  });
});
