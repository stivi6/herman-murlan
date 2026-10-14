import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createFullDeck } from "@/lib/game/cards";

describe("vendored card art coverage", () => {
  it("every physical card ID has a local SVG face, plus the back", () => {
    const root = join(process.cwd(), "public", "cards");
    for (const card of createFullDeck()) {
      expect(existsSync(join(root, `${card.id}.svg`)), `missing art for ${card.id}`).toBe(true);
    }
    expect(existsSync(join(root, "CARD_BACK.svg"))).toBe(true);
    expect(existsSync(join(root, "LICENSE-CC0.txt"))).toBe(true);
  });
});
