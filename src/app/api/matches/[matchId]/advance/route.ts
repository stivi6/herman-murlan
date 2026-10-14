import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { getMembership, getRoom, loadSession } from "@/lib/server/rooms";
import { autoAdvanceHand, runBotTurns } from "@/lib/server/gameplay";

/**
 * Continue a completed hand: deal the next hand / enter exchange.
 * Safe to call repeatedly; autoAdvanceHand is a no-op unless handResult is pending.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in first.", 401);

  const loaded = await loadSession(matchId);
  if (!loaded) return jsonError("MATCH_NOT_FOUND", "Match not found.", 404);
  const room = await getRoom(loaded.state.roomId);
  if (!room) return jsonError("ROOM_NOT_FOUND", "Room not found.", 404);
  const me = await getMembership(room.id, user.id);
  if (!me) return jsonError("FORBIDDEN", "Not a member.", 403);

  if (loaded.state.status === "handResult") {
    await autoAdvanceHand(matchId);
  } else {
    await runBotTurns(matchId);
  }
  const after = await loadSession(matchId);
  return jsonOk({ status: after?.state.status ?? "unknown", version: after?.version ?? 0 });
}
