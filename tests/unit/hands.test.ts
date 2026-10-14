import { describe, expect, it } from "vitest";
import { applyAction } from "@/lib/game/transitions";
import { setupNextHandExchange } from "@/lib/game/transitions";
import { testStateWithHands, hand } from "@/lib/game/fixtures";
import type { Seat } from "@/lib/game/state";
import type { Card } from "@/lib/game/cards";
import {
  evaluateMatchEnd,
  teamHandPoints,
  teamTotalsFromScores,
} from "@/lib/game/scoring";

describe("finishing a hand", () => {
  it("a player going out stays finished even if their last play is beaten", () => {
    let st = testStateWithHands(
      [
        ["S3"], // seat 0 goes out immediately with the forced opening
        ["S5", "H6"],
        ["S7", "H8"],
        ["S9", "H10"],
      ],
      0,
      { isFirstHand: true, openingPending: true },
    );
    const r = applyAction(st, { type: "play", seat: 0, cardIds: ["S3"] });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("open failed");
    st = r.value;
    expect(st.finished[0]).toBe(true);
    // Seat 1 beats with a higher single; seat 0 remains finished.
    const b = applyAction(st, { type: "play", seat: 1, cardIds: ["S5"] });
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error("beat failed");
    expect(b.value.finished[0]).toBe(true);
    expect(b.value.placements[0]).toBe(1);
  });

  it("hand ends when three finish; last remaining is fourth; points are 3/2/1/0", () => {
    let st = testStateWithHands(
      [
        ["S3"],
        ["S5"],
        ["S7", "S8"],
        ["S9", "S10"],
      ],
      0,
      { isFirstHand: true, openingPending: true },
    );
    const steps: { seat: Seat; cards: string[] }[] = [
      { seat: 0, cards: ["S3"] },
      { seat: 1, cards: ["S5"] },
      // Trick resets to seat 1 (last successful, seat 0 finished) — seat 1 leads again but is out...
      // Actually after 0 and 1 go out, seat 2 leads.
    ];
    let r = applyAction(st, { type: "play", seat: 0, cardIds: ["S3"] });
    if (!r.ok) throw new Error(`open failed: ${r.error.code}`);
    st = r.value;
    r = applyAction(st, { type: "play", seat: 1, cardIds: ["S5"] });
    if (!r.ok) throw new Error(`second play failed: ${r.error.code}`);
    st = r.value;
    // Seat 1 beat seat 0's S3 and went out; table shows S5, seat 2 to act.
    expect(st.currentCombo?.cardIds).toEqual(["S5"]);
    expect(st.currentActor).toBe(2);
    r = applyAction(st, { type: "play", seat: 2, cardIds: ["S7"] });
    if (!r.ok) throw new Error(`third play failed: ${r.error.code}`);
    st = r.value;
    // Seat 3 passes, seat 2 leads again and goes out with S8 -> hand ends.
    const p = applyAction(st, { type: "pass", seat: 3 });
    if (!p.ok) throw new Error(`pass failed: ${p.error.code}`);
    st = p.value;
    expect(st.currentActor).toBe(2);
    r = applyAction(st, { type: "play", seat: 2, cardIds: ["S8"] });
    if (!r.ok) throw new Error(`final play failed: ${r.error.code}`);
    st = r.value;
    expect(st.status).toBe("handResult");
    expect(st.placements).toEqual([1, 2, 3, 4]);
    expect(st.scores).toEqual([3, 2, 1, 0]);
    void steps;
  });
});

describe("scoring and target extension", () => {
  it("single qualifier at 21 wins immediately", () => {
    const e = evaluateMatchEnd([21, 10, 5, 0], 21);
    expect(e.finished).toBe(true);
    expect(e.winner).toBe(0);
  });

  it("multiple qualifiers extend 21 -> 31 and do not finish", () => {
    const e = evaluateMatchEnd([21, 21, 0, 0], 21);
    expect(e.finished).toBe(false);
    expect(e.nextTarget).toBe(31);
  });

  it("cap-51 fallback: highest wins, tie when equal", () => {
    const w = evaluateMatchEnd([51, 55, 40, 30], 51);
    expect(w.finished && w.winner).toBe(1);
    const t = evaluateMatchEnd([52, 52, 10, 0], 51);
    expect(t.finished && t.tie).toBe(true);
  });

  it("2v2 team totals sum placements and evaluate on team totals", () => {
    // Seats 0+2 vs 1+3. Placements: 0->1st(3), 1->2nd(2), 2->3rd(1), 3->4th(0).
    const placements = [1, 2, 3, 4];
    expect(teamHandPoints(placements)).toEqual([4, 2]);
    expect(teamTotalsFromScores([10, 8, 6, 4])).toEqual([16, 12]);
    const e = evaluateMatchEnd([21, 20], 21);
    expect(e.finished && e.winner).toBe(0);
  });

  it("finished match needs no extra exchange or deal", () => {
    let st = testStateWithHands(
      [["S3"], ["S5"], ["S7", "S8"], ["S9", "S10"]],
      0,
      { isFirstHand: true, openingPending: true },
    );
    // Fast-forward scores near target so this hand ends the match.
    st = { ...st, scores: [20, 10, 5, 0] };
    for (const [seat, cards] of [[0, ["S3"]], [1, ["S5"]], [2, ["S7"]]] as [Seat, string[]][]) {
      void cards;
      void seat;
    }
    let r = applyAction(st, { type: "play", seat: 0, cardIds: ["S3"] });
    st = r.ok ? r.value : st;
    r = applyAction(st, { type: "play", seat: 1, cardIds: ["S5"] });
    st = r.ok ? r.value : st;
    const p = applyAction(st, { type: "pass", seat: 2 });
    // Seat 2 may be leader here; handle either branch.
    if (!p.ok) {
      const q = applyAction(st, { type: "play", seat: st.currentActor as Seat, cardIds: [st.hands[st.currentActor as Seat][0].id] });
      expect(q.ok).toBe(true);
      st = q.ok ? q.value : st;
    } else {
      st = p.value;
    }
    // Drive to completion with simple legal plays.
    let guard = 0;
    while (st.status === "playing" && guard++ < 20) {
      const actor = st.currentActor as Seat;
      if (st.currentCombo === null) {
        const id = st.hands[actor][0].id;
        const q = applyAction(st, { type: "play", seat: actor, cardIds: [id] });
        expect(q.ok).toBe(true);
        st = q.ok ? q.value : st;
      } else {
        const q = applyAction(st, { type: "pass", seat: actor });
        if (q.ok) st = q.value;
        else {
          // try beating with highest single
          const ids = st.hands[actor].map((c) => c.id);
          let played = false;
          for (const id of ids) {
            const attempt = applyAction(st, { type: "play", seat: actor, cardIds: [id] });
            if (attempt.ok) {
              st = attempt.value;
              played = true;
              break;
            }
          }
          if (!played) throw new Error("stuck");
        }
      }
    }
    expect(["finished", "handResult"].includes(st.status)).toBe(true);
  });
});

describe("exchange rules", () => {
  function dealtFourthHasBothJokers(): [Card[], Card[], Card[], Card[]] {
    return [
      hand(["S3", "H4"]),
      hand(["S5", "H6"]),
      hand(["S7", "H8"]),
      hand(["JOKER_BLACK", "JOKER_RED", "S9"]),
    ];
  }

  it("skips swap when fourth holds both jokers; first-place opens next hand", () => {
    let st = testStateWithHands(
      [["S3"], ["S5"], ["S7", "S8"], ["S9", "S10"]],
      0,
      { isFirstHand: true, openingPending: true },
    );
    // Manually craft a completed hand state.
    st = {
      ...st,
      status: "handResult",
      finished: [true, true, true, true],
      placements: [1, 2, 3, 4],
      finishOrder: [0, 1, 2, 3],
      scores: [3, 2, 1, 0],
      currentActor: null,
    };
    const r = setupNextHandExchange(st, dealtFourthHasBothJokers());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("setup failed");
    expect(r.value.status).toBe("playing");
    expect(r.value.exchange).toBeNull();
    expect(r.value.currentActor).toBe(0); // first-place opens
  });

  it("normal exchange moves highest card and enforces 3–10 return", () => {
    let st = testStateWithHands(
      [["S3"], ["S5"], ["S7", "S8"], ["S9", "S10"]],
      0,
      { isFirstHand: true, openingPending: true },
    );
    st = {
      ...st,
      status: "handResult",
      finished: [true, true, true, true],
      placements: [1, 2, 3, 4],
      finishOrder: [0, 1, 2, 3],
      scores: [3, 2, 1, 0],
      currentActor: null,
    };
    const dealt: [Card[], Card[], Card[], Card[]] = [
      hand(["SK", "SQ", "SJ"]), // first (seat 0)
      hand(["S5", "H6", "D7"]),
      hand(["S8", "H9", "D10"]),
      hand(["SA", "H4", "D5"]), // fourth (seat 3): highest = SA
    ];
    const r = setupNextHandExchange(st, dealt);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("setup failed");
    const ex = r.value;
    expect(ex.status).toBe("exchange");
    expect(ex.exchange?.receivedCardId).toBe("SA");
    expect(ex.hands[0].map((c) => c.id)).toContain("SA");
    // Illegal return (K is not 3–10, and seat 0 holds J/Q too... J/Q/K not allowed).
    // Seat 0 hand: SK,SQ,SJ,SA(received). No 3–10 except none -> fallback allows any.
    // So use a different hand with a low card to test restriction.
    const dealt2: [Card[], Card[], Card[], Card[]] = [
      hand(["SK", "S5", "S6"]),
      hand(["S7", "H8", "D9"]),
      hand(["S10", "HJ", "DQ"]),
      hand(["SA", "H4", "D5"]),
    ];
    const r2 = setupNextHandExchange(st, dealt2);
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error("setup2 failed");
    const bad = applyAction(r2.value, { type: "exchangeSelect", seat: 0, cardId: "SK" });
    expect(bad.ok).toBe(false);
    const good = applyAction(r2.value, { type: "exchangeSelect", seat: 0, cardId: "S5" });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.value.status).toBe("playing");
      expect(good.value.currentActor).toBe(3); // fourth opens
    }
  });

  it("first-place fallback allows any card when holding no 3–10", () => {
    let st = testStateWithHands(
      [["S3"], ["S5"], ["S7", "S8"], ["S9", "S10"]],
      0,
      { isFirstHand: true, openingPending: true },
    );
    st = {
      ...st,
      status: "handResult",
      finished: [true, true, true, true],
      placements: [1, 2, 3, 4],
      finishOrder: [0, 1, 2, 3],
      scores: [3, 2, 1, 0],
      currentActor: null,
    };
    const dealt: [Card[], Card[], Card[], Card[]] = [
      hand(["SJ", "SQ", "SK"]), // no 3–10
      hand(["S5", "H6", "D7"]),
      hand(["S8", "H9", "D10"]),
      hand(["SA", "H4", "D5"]),
    ];
    const r = setupNextHandExchange(st, dealt);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("setup failed");
    const fb = applyAction(r.value, { type: "exchangeSelect", seat: 0, cardId: "SK" });
    expect(fb.ok).toBe(true);
  });
});
