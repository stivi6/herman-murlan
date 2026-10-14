import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { adminClient } from "@/lib/supabase/admin.server";
import { getMembership, getRoom, listMembers } from "@/lib/server/rooms";

export async function GET(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in first.", 401);

  const room = await getRoom(roomId);
  if (!room) return jsonError("ROOM_NOT_FOUND", "Room not found.", 404);
  const me = await getMembership(roomId, user.id);
  if (!me) return jsonError("FORBIDDEN", "You are not a member of this room.", 403);

  // Touch presence.
  const admin = adminClient();
  await admin
    .from("room_members")
    .update({ last_seen_at: new Date().toISOString(), presence_status: "online" })
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  const members = await listMembers(roomId);
  return jsonOk({
    room: {
      id: room.id,
      code: room.code,
      mode: room.mode,
      status: room.status,
      hostUserId: room.host_user_id,
      currentMatchId: room.current_match_id,
      allowBots: (room.settings as { allowBots?: boolean })?.allowBots ?? false,
    },
    members: members.map((m) => ({
      userId: m.is_bot ? null : m.user_id,
      seat: m.seat_index,
      displayName: m.display_name,
      ready: m.ready,
      team: m.team_id,
      isBot: m.is_bot,
      isHost: m.is_host,
      presence: m.presence_status,
    })),
    mySeat: me.seat_index,
    isHost: me.is_host,
  });
}
