import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { adminClient } from "@/lib/supabase/admin.server";
import { getMembership, getRoom, loadSession } from "@/lib/server/rooms";
import type { Json } from "@/lib/supabase/database";

/**
 * Host-only: end/cancel the current match (e.g. a player disconnected for
 * good). Seats and scores are left as-is; the room returns to the lobby so
 * the group can start a fresh match. Never invents card positions.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in first.", 401);

  const room = await getRoom(roomId);
  if (!room) return jsonError("ROOM_NOT_FOUND", "Room not found.", 404);
  const me = await getMembership(roomId, user.id);
  if (!me) return jsonError("FORBIDDEN", "Not a member.", 403);
  if (!me.is_host) return jsonError("HOST_ONLY", "Only the host can end the match.", 403);
  if (!room.current_match_id) return jsonOk({ ended: false });

  const admin = adminClient();
  const loaded = await loadSession(room.current_match_id);
  if (loaded && loaded.state.status !== "finished" && loaded.state.status !== "cancelled") {
    const next = { ...loaded.state, status: "cancelled" as const, currentActor: null, version: loaded.state.version + 1 };
    await admin
      .from("game_sessions")
      .update({ status: "cancelled", private_state: next as unknown as Json, version: next.version })
      .eq("id", room.current_match_id);
    const { data: snapRow } = await admin
      .from("match_public_snapshots")
      .select("snapshot")
      .eq("match_id", room.current_match_id)
      .single();
    if (snapRow) {
      const snap = (snapRow as { snapshot: Record<string, unknown> }).snapshot;
      await admin
        .from("match_public_snapshots")
        .update({ snapshot: { ...snap, status: "cancelled" } as unknown as Json, version: next.version })
        .eq("match_id", room.current_match_id);
    }
    await admin.from("game_events").insert({
      match_id: room.current_match_id,
      room_id: roomId,
      version: next.version,
      kind: "match_cancelled",
      payload: { by: "host" } as unknown as Json,
    });
  }
  await admin.from("rooms").update({ status: "lobby", current_match_id: null }).eq("id", roomId);
  return jsonOk({ ended: true });
}
