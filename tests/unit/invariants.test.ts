import { describe, expect, it } from "vitest";
import { createFullDeck, type Card } from "@/lib/game/cards";
import { applyAction } from "@/lib/game/transitions";
import { assertInvariants, createInitialMatchState, type Seat } from "@/lib/game/state";
import { startHandWithHands } from "@/lib/game/transitions";
import { dealNewHands, randomStartSeat } from "@/lib/server/deal";

/** Deterministic PRNG for property tests (mulberry32). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledWith<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

describe("invariants over randomized legal/illegal sequences", () => {
  it("holds: no dup/lost cards, only actor moves, scores never decrease, invalid leaves unchanged", () => {
    for (let game = 0; game < 15; game++) {
      const rand = mulberry32(1000 + game);
      const deck = shuffledWith(createFullDeck(), rand);
      // Manual round-robin with random start.
      const start = Math.floor(rand() * 4) as Seat;
      const hands: [Card[], Card[], Card[], Card[]] = [[], [], [], []];
      deck.forEach((c, i) => hands[((start + i) % 4) as Seat].push(c));
      let st = startHandWithHands(
        createInitialMatchState({ matchId: `m${game}`, roomId: "r", mode: "ffa" }),
        hands,
        { handNumber: 1, isFirstHand: game % 2 === 0 },
      );
      // Opening: S3 holder must open when required.
      if (st.isFirstHand) {
        const holder = ([0, 1, 2, 3] as Seat[]).find((s) =>
          st.hands[s].some((c) => c.id === "S3"),
        )!;
        expect(st.currentActor).toBe(holder);
      }
      let prevScores = [...st.scores];
      let prevVersion = st.version;
      for (let step = 0; step < 120 && st.status === "playing"; step++) {
        // Invariants each step.
        expect(assertInvariants(st)).toEqual([]);
        const actor = st.currentActor as Seat;
        expect(st.finished[actor]).toBe(false);
        const roll = rand();
        if (roll < 0.7) {
          // Try a random single from the actor's hand (may be illegal -> must leave unchanged).
          const handCards = st.hands[actor];
          if (handCards.length === 0) break;
          const pick = handCards[Math.floor(rand() * handCards.length)];
          const before = JSON.stringify({ ...st, version: 0 });
          const r = applyAction(st, { type: "play", seat: actor, cardIds: [pick.id] });
          if (r.ok) {
            st = r.value;
            expect(st.version).toBeGreaterThan(prevVersion);
            prevVersion = st.version;
            for (let s = 0; s < 4; s++) expect(st.scores[s]).toBeGreaterThanOrEqual(prevScores[s]);
            prevScores = [...st.scores];
          } else {
            // Invalid move leaves state unchanged (compare modulo version).
            expect(JSON.stringify({ ...st, version: 0 })).toBe(before);
            // Pass instead to make progress (if legal).
            const p = applyAction(st, { type: "pass", seat: actor });
            if (p.ok) {
              st = p.value;
              prevVersion = st.version;
            } else {
              // If pass illegal (leading), play lowest single which is always legal on open table.
              if (st.currentCombo === null) {
                const sorted = [...handCards].sort((a, b) =>
                  a.id < b.id ? -1 : 1,
                );
                // Ensure S3 included when opening pending.
                let ids = [sorted[0].id];
                if (st.openingPending && !ids.includes("S3")) ids = ["S3"];
                const q = applyAction(st, { type: "play", seat: actor, cardIds: ids });
                expect(q.ok).toBe(true);
                if (q.ok) {
                  st = q.value;
                  prevVersion = st.version;
                }
              }
            }
          }
        } else {
          const p = applyAction(st, { type: "pass", seat: actor });
          if (p.ok) {
            st = p.value;
            prevVersion = st.version;
          }
        }
        if (st.status === "finished" || st.status === "handResult") break;
      }
      expect(assertInvariants(st)).toEqual([]);
    }
  });

  it("server shuffle helper deals valid hands", () => {
    for (let i = 0; i < 5; i++) {
      const hands = dealNewHands(randomStartSeat());
      const total = hands.reduce((n, h) => n + h.length, 0);
      expect(total).toBe(54);
      const sizes = hands.map((h) => h.length).sort((a, b) => b - a);
      expect(sizes).toEqual([14, 14, 13, 13]);
    }
  });
});
