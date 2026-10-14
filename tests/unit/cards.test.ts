import { describe, expect, it } from "vitest";
import {
  CANONICAL_RANK_ORDER,
  cardFromId,
  comparePhysical,
  createFullDeck,
  rankValueOf,
} from "@/lib/game/cards";

describe("canonical card order", () => {
  it("orders A < 2 < Black Joker < Red Joker for singles", () => {
    const a = cardFromId("SA");
    const two = cardFromId("H2");
    const bj = cardFromId("JOKER_BLACK");
    const rj = cardFromId("JOKER_RED");
    expect(rankValueOf(a)).toBeLessThan(rankValueOf(two));
    expect(rankValueOf(two)).toBeLessThan(rankValueOf(bj));
    expect(rankValueOf(bj)).toBeLessThan(rankValueOf(rj));
  });

  it("has the exact canonical rank order", () => {
    expect(CANONICAL_RANK_ORDER).toEqual([
      "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2",
      "JOKER_BLACK", "JOKER_RED",
    ]);
  });

  it("builds a 54-card deck with unique IDs", () => {
    const deck = createFullDeck();
    expect(deck).toHaveLength(54);
    expect(new Set(deck.map((c) => c.id)).size).toBe(54);
    expect(deck.map((c) => c.id)).toContain("S3");
    expect(deck.map((c) => c.id)).toContain("JOKER_BLACK");
    expect(deck.map((c) => c.id)).toContain("JOKER_RED");
  });

  it("suits do not affect rank strength; S3 special only by ID", () => {
    const s3 = cardFromId("S3");
    const h3 = cardFromId("H3");
    expect(rankValueOf(s3)).toBe(rankValueOf(h3));
    expect(comparePhysical(s3, h3)).not.toBe(0); // deterministic physical tiebreak exists
  });
});
