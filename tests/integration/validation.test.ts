import { describe, expect, it } from "vitest";
import { createRoomSchema, joinRoomSchema, matchActionSchema } from "@/lib/schemas/room";

describe("API input validation (Zod)", () => {
  it("rejects bad usernames", () => {
    expect(createRoomSchema.safeParse({ displayName: "", mode: "ffa" }).success).toBe(false);
    expect(
      createRoomSchema.safeParse({ displayName: "a".repeat(19), mode: "ffa" }).success,
    ).toBe(false);
    expect(createRoomSchema.safeParse({ displayName: "a<b", mode: "ffa" }).success).toBe(false);
    expect(createRoomSchema.safeParse({ displayName: "Arben", mode: "ffa" }).success).toBe(true);
  });

  it("rejects bad room modes and codes", () => {
    expect(createRoomSchema.safeParse({ displayName: "A", mode: "ranked" }).success).toBe(false);
    expect(joinRoomSchema.safeParse({ code: "x", displayName: "A" }).success).toBe(false);
    expect(joinRoomSchema.safeParse({ code: "ABC123", displayName: "A" }).success).toBe(true);
  });

  it("rejects malformed match actions and card IDs", () => {
    const base = { actionId: "123e4567-e89b-12d3-a456-426614174000", expectedVersion: 0 };
    expect(
      matchActionSchema.safeParse({ ...base, action: { type: "play", cardIds: ["ZZ"] } }).success,
    ).toBe(false);
    expect(
      matchActionSchema.safeParse({ ...base, action: { type: "play", cardIds: [] } }).success,
    ).toBe(false);
    expect(
      matchActionSchema.safeParse({ ...base, action: { type: "play", cardIds: ["S3"] } }).success,
    ).toBe(true);
    expect(matchActionSchema.safeParse({ ...base, action: { type: "pass" } }).success).toBe(true);
    expect(
      matchActionSchema.safeParse({
        ...base,
        action: { type: "exchangeSelect", cardId: "JOKER_RED" },
      }).success,
    ).toBe(true);
    expect(
      matchActionSchema.safeParse({ ...base, expectedVersion: -1, action: { type: "pass" } }).success,
    ).toBe(false);
  });
});
