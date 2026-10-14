import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { adminClient } from "@/lib/supabase/admin.server";
import { getMembership, getRoom, listMembers } from "@/lib/server/rooms";

/** Host creates a fresh match reusing current humans + the room's bot-fill setting. */
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
  if (!me.is_host) return jsonError("HOST_ONLY", "Only the host can start a rematch.", 403);

  const admin = adminClient();
  // Remove old bot seats; humans keep seats. Reconnected humans are those still members.
  const members = await listMembers(roomId);
  for (const m of members.filter((x) => x.is_bot)) {
    await admin.from("room_members").delete().eq("room_id", roomId).eq("user_id", m.user_id);
  }
  // Reset ready flags for a fresh lobby check? Rematch requires ready again.
  await admin.from("room_members").update({ ready: false }).eq("room_id", roomId);

  // Re-mark the caller ready is NOT automatic — host must ready up via lobby.
  // Return to lobby state.
  await admin.from("rooms").update({ status: "lobby", current_match_id: null }).eq("id", roomId);
  return jsonOk({ toLobby: true });
}
