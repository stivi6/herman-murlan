import { describe, expect, it } from "vitest";
import { createFullDeck } from "@/lib/game/cards";
import { dealRoundRobin, verifyDealAccountsForAllCards, verifyHandSizes } from "@/lib/game/deck";
import { applyAction, startHandWithHands } from "@/lib/game/transitions";
import { createInitialMatchState, type Seat } from "@/lib/game/state";
import { hand, testStateWithHands } from "@/lib/game/fixtures";

describe("dealing", () => {
  it("deals all 54 cards exactly once with two 14s and two 13s", () => {
    for (const start of [0, 1, 2, 3] as Seat[]) {
      const hands = dealRoundRobin(createFullDeck(), start);
      expect(verifyDealAccountsForAllCards(hands)).toBe(true);
      expect(verifyHandSizes(hands)).toBe(true);
    }
  });

  it("gives the dealing-order-first seats the extra cards", () => {
    const hands = dealRoundRobin(createFullDeck(), 2);
    expect(hands[2]).toHaveLength(14);
    expect(hands[3]).toHaveLength(14);
    expect(hands[0]).toHaveLength(13);
    expect(hands[1]).toHaveLength(13);
  });

  it("first-hand leader is the S3 holder", () => {
    const base = createInitialMatchState({ matchId: "m", roomId: "r", mode: "ffa" });
    // Put S3 in seat 2's hand.
    const h0 = hand(["S4", "H5", "D6"]);
    const h1 = hand(["S7", "H8", "D9"]);
    const h2 = hand(["S3", "H10", "DJ"]);
    const h3 = hand(["SQ", "HK", "DA"]);
    const started = startHandWithHands(base, [h0, h1, h2, h3], {
      handNumber: 1,
      isFirstHand: true,
    });
    expect(started.currentActor).toBe(2);
  });
});

describe("opening S3 rule", () => {
  it("rejects a first play without S3 and accepts one with S3", () => {
    const st = testStateWithHands(
      [
        ["S3", "H4", "D5"],
        ["S6", "H7", "D8"],
        ["S9", "H10", "DJ"],
        ["SQ", "HK", "DA"],
      ],
      0,
      { isFirstHand: true, openingPending: true },
    );
    const bad = applyAction(st, { type: "play", seat: 0, cardIds: ["H4"] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("MUST_INCLUDE_S3");
    const good = applyAction(st, { type: "play", seat: 0, cardIds: ["S3"] });
    expect(good.ok).toBe(true);
  });

  it("later hands have no forced S3 rule", () => {
    const st = testStateWithHands(
      [
        ["S3", "H4", "D5"],
        ["S6", "H7", "D8"],
        ["S9", "H10", "DJ"],
        ["SQ", "HK", "DA"],
      ],
      1,
      { isFirstHand: false, openingPending: false },
    );
    const r = applyAction(st, { type: "play", seat: 1, cardIds: ["S6"] });
    expect(r.ok).toBe(true);
  });
});

describe("turns and passing", () => {
  it("only the current actor may move", () => {
    const st = testStateWithHands(
      [
        ["S3", "H4"],
        ["S5", "H6"],
        ["S7", "H8"],
        ["S9", "H10"],
      ],
      0,
    );
    const r = applyAction(st, { type: "play", seat: 1, cardIds: ["S5"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_YOUR_TURN");
  });

  it("pass from the trick leader is rejected", () => {
    const st = testStateWithHands(
      [
        ["S3", "H4"],
        ["S5", "H6"],
        ["S7", "H8"],
        ["S9", "H10"],
      ],
      0,
    );
    const r = applyAction(st, { type: "pass", seat: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PASS_NOT_ALLOWED_LEAD");
  });

  it("all-pass resets to the last successful player and clears pass markers", () => {
    let st = testStateWithHands(
      [
        ["S3", "SA"],
        ["S5", "SK"],
        ["S7", "SQ"],
        ["S9", "SJ"],
      ],
      0,
    );
    // Seat 0 leads low single.
    const r = applyAction(st, { type: "play", seat: 0, cardIds: ["S3"] });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("lead failed");
    st = r.value;
    // Others pass one by one; last pass should reset the trick to seat 0.
    for (const s of [1, 2, 3] as Seat[]) {
      expect(st.currentActor).toBe(s);
      const p = applyAction(st, { type: "pass", seat: s });
      expect(p.ok).toBe(true);
      if (!p.ok) throw new Error("pass failed");
      st = p.value;
    }
    expect(st.currentCombo).toBeNull();
    expect(st.currentActor).toBe(0);
    expect(st.passed).toEqual([false, false, false, false]);
  });

  it("a weaker or equal response does not beat", () => {
    let st = testStateWithHands(
      [
        ["SK", "SA"],
        ["S5", "S6"],
        ["S7", "S8"],
        ["S9", "S10"],
      ],
      0,
    );
    const r = applyAction(st, { type: "play", seat: 0, cardIds: ["SK"] });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("lead failed");
    st = r.value;
    const weak = applyAction(st, { type: "play", seat: 1, cardIds: ["S5"] });
    expect(weak.ok).toBe(false);
    const equal = applyAction({ ...st, hands: [st.hands[0], hand(["HK", "S6"]), st.hands[2], st.hands[3]] }, {
      type: "play",
      seat: 1,
      cardIds: ["HK"],
    });
    expect(equal.ok).toBe(false);
  });
});
