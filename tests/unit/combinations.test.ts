import { describe, expect, it } from "vitest";
import { cardsFromIds } from "@/lib/game/cards";
import { classifyCombination } from "@/lib/game/combinations";
import { beats } from "@/lib/game/compare";

function cls(ids: string[]) {
  return classifyCombination(cardsFromIds(ids));
}

describe("combination classification", () => {
  it("classifies single / pair / triple / bomb", () => {
    const single = cls(["S3"]);
    expect(single.ok && single.value.type).toBe("single");
    const pair = cls(["S3", "H3"]);
    expect(pair.ok && pair.value.type).toBe("pair");
    const triple = cls(["S3", "H3", "D3"]);
    expect(triple.ok && triple.value.type).toBe("triple");
    const bomb = cls(["S3", "H3", "D3", "C3"]);
    expect(bomb.ok && bomb.value.type).toBe("bomb");
  });

  it("rejects mixed-rank pair/triple", () => {
    expect(cls(["S3", "H4"]).ok).toBe(false);
    expect(cls(["S3", "H3", "D4"]).ok).toBe(false);
    expect(cls(["S3", "H3", "D3", "C4"]).ok).toBe(false);
  });

  it("accepts valid scales across suits (5+ consecutive, ending at A)", () => {
    expect(cls(["S3", "H4", "D5", "C6", "S7"]).ok).toBe(true);
    const high = cls(["S10", "HJ", "DQ", "CK", "SA"]);
    expect(high.ok && high.value.type).toBe("scale");
    expect(cls(["S3", "H4", "D5", "C6", "S7", "H8"]).ok).toBe(true);
  });

  it("accepts the special low A,2,3,4,5 scale", () => {
    const r = cls(["SA", "H2", "D3", "C4", "S5"]);
    expect(r.ok && r.value.type).toBe("scale");
    if (r.ok) expect(r.value.topRankKey).toBe("5");
  });

  it("rejects scales with jokers, stray 2s, wraps, gaps, duplicates", () => {
    expect(cls(["S3", "H4", "D5", "C6", "JOKER_BLACK"]).ok).toBe(false);
    expect(cls(["S5", "H6", "D7", "C8", "S2"]).ok).toBe(false); // 2 outside low-ace seq
    expect(cls(["S3", "H4", "D5", "C6", "S8"]).ok).toBe(false); // gap
    expect(cls(["S3", "H3", "D4", "C5", "S6"]).ok).toBe(false); // repeated rank
    expect(cls(["SQ", "HK", "DA", "C2", "S3"]).ok).toBe(false); // wrap not allowed
    expect(cls(["S3", "H4", "D5", "C6"]).ok).toBe(false); // only 4 cards, not a bomb
  });

  it("uses precedence: 5+ consecutive is always a scale", () => {
    const r = cls(["S3", "H4", "D5", "C6", "S7"]);
    expect(r.ok && r.value.type).toBe("scale");
  });

  it("compares scales only at equal length; higher top wins; equal does not beat", () => {
    const low = cls(["S3", "H4", "D5", "C6", "S7"]);
    const high = cls(["S4", "H5", "D6", "C7", "S8"]);
    const longer = cls(["S3", "H4", "D5", "C6", "S7", "H8"]);
    expect(low.ok && high.ok && longer.ok).toBe(true);
    if (low.ok && high.ok && longer.ok) {
      expect(beats(high.value, low.value)).toBe(true);
      expect(beats(low.value, high.value)).toBe(false);
      expect(beats(high.value, high.value)).toBe(false);
      expect(beats(longer.value, high.value)).toBe(false); // different lengths
    }
  });

  it("bomb beats single/pair/triple/scale; higher bomb wins; equal does not", () => {
    const bomb3 = cls(["S3", "H3", "D3", "C3"]);
    const bomb4 = cls(["S4", "H4", "D4", "C4"]);
    const singleA = cls(["SA"]);
    const pairA = cls(["SA", "HA"]);
    const scale = cls(["S3", "H4", "D5", "C6", "S7"]);
    expect(bomb3.ok && bomb4.ok && singleA.ok && pairA.ok && scale.ok).toBe(true);
    if (bomb3.ok && bomb4.ok && singleA.ok && pairA.ok && scale.ok) {
      expect(beats(bomb3.value, singleA.value)).toBe(true);
      expect(beats(bomb3.value, pairA.value)).toBe(true);
      expect(beats(bomb3.value, scale.value)).toBe(true);
      expect(beats(singleA.value, bomb3.value)).toBe(false);
      expect(beats(bomb3.value, bomb4.value)).toBe(false);
      expect(beats(bomb4.value, bomb3.value)).toBe(true);
      expect(beats(bomb3.value, bomb3.value)).toBe(false);
    }
  });

  it("jokers can never form four-of-a-kind", () => {
    expect(cls(["JOKER_BLACK", "JOKER_RED", "S3", "H3"]).ok).toBe(false);
  });
});
