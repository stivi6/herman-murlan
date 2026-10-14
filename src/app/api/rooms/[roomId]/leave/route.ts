import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { adminClient } from "@/lib/supabase/admin.server";
import { getMembership, getRoom, listMembers } from "@/lib/server/rooms";

/**
 * Leave the lobby (or mark offline during a match — seat is preserved).
 * If the host leaves the lobby, host transfers to the earliest remaining member.
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
  if (!me) return jsonOk({ left: false });

  const admin = adminClient();
  if (room.status === "playing" && room.current_match_id) {
    // Preserve the seat; mark offline so the table shows a disconnected label.
    await admin
      .from("room_members")
      .update({ presence_status: "offline", ready: false })
      .eq("room_id", roomId)
      .eq("user_id", user.id);
    // Transfer host controls to another connected human without touching game state.
    if (me.is_host) {
      const members = await listMembers(roomId);
      const next = members
        .filter((m) => !m.is_bot && m.user_id !== user.id && m.presence_status !== "offline")
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0];
      if (next) {
        await admin.from("rooms").update({ host_user_id: next.user_id }).eq("id", roomId);
        await admin.from("room_members").update({ is_host: false }).eq("room_id", roomId).eq("user_id", user.id);
        await admin.from("room_members").update({ is_host: true }).eq("room_id", roomId).eq("user_id", next.user_id);
      }
    }
    return jsonOk({ left: true, preservedSeat: true });
  }

  await admin.from("room_members").delete().eq("room_id", roomId).eq("user_id", user.id);
  const remaining = await listMembers(roomId);
  const humans = remaining.filter((m) => !m.is_bot);
  if (humans.length === 0) {
    // Expire empty rooms instead of deleting (keeps match history consistent).
    await admin.from("rooms").update({ status: "expired" }).eq("id", roomId);
    return jsonOk({ left: true });
  }
  if (me.is_host) {
    const next = [...humans].sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0];
    await admin.from("rooms").update({ host_user_id: next.user_id }).eq("id", roomId);
    await admin.from("room_members").update({ is_host: true }).eq("room_id", roomId).eq("user_id", next.user_id);
  }
  return jsonOk({ left: true });
}
