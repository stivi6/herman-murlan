import { z } from "zod";

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Username is required.")
  .max(18, "Username must be 18 characters or fewer.")
  .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), "Username contains invalid characters.")
  .refine((s) => !/[<>]/.test(s), "Username cannot contain < or >.");

export const roomModeSchema = z.enum(["ffa", "2v2"]);

export const createRoomSchema = z.object({
  displayName: displayNameSchema,
  mode: roomModeSchema.default("ffa"),
  allowBots: z.boolean().default(false),
});

export const joinRoomSchema = z.object({
  code: z.string().trim().min(4).max(16),
  displayName: displayNameSchema,
});

export const readySchema = z.object({
  ready: z.boolean(),
});

export const startMatchSchema = z.object({
  allowBots: z.boolean().optional(),
});

const cardIdSchema = z
  .string()
  .regex(/^([SHDC](3|4|5|6|7|8|9|10|J|Q|K|A|2)|JOKER_BLACK|JOKER_RED)$/, "Invalid card ID.");

export const matchActionSchema = z.object({
  actionId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("play"), cardIds: z.array(cardIdSchema).min(1).max(14) }),
    z.object({ type: z.literal("pass") }),
    z.object({ type: z.literal("exchangeSelect"), cardId: cardIdSchema }),
  ]),
});

export const roomCodeNormalized = z
  .string()
  .trim()
  .toUpperCase()
  .transform((s) => s.replace(/[\s-]+/g, ""));

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type MatchActionInput = z.infer<typeof matchActionSchema>;
