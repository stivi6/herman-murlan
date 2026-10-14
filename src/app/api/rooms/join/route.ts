import { joinRoomSchema } from "@/lib/schemas/room";
import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { adminClient } from "@/lib/supabase/admin.server";
import { normalizeCode } from "@/lib/server/roomCode";
import { getRoomByCode, listMembers, teamForSeat } from "@/lib/server/rooms";

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured on this deployment.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in (anonymous) first.", 401);
  if (!rateLimit(`join:${clientKey(req, user.id)}`, 20, 60_000)) {
    return jsonError("RATE_LIMITED", "Too many join attempts. Slow down.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("BAD_REQUEST", "Invalid JSON.", 400);
  }
  const parsed = joinRoomSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
  }
  const code = normalizeCode(parsed.data.code);
  const displayName = parsed.data.displayName;

  const admin = adminClient();
  const room = await getRoomByCode(code);
  if (!room) return jsonError("ROOM_NOT_FOUND", "No room with that code.", 404);
  if (room.status === "expired") return jsonError("ROOM_EXPIRED", "That room has expired.", 410);
  if (new Date(room.expires_at).getTime() < Date.now()) {
    return jsonError("ROOM_EXPIRED", "That room has expired.", 410);
  }

  const members = await listMembers(room.id);
  const existing = members.find((m) => m.user_id === user.id && !m.is_bot);
  if (existing) {
    return jsonOk({ roomId: room.id, seat: existing.seat_index, rejoined: true });
  }
  const humanCount = members.filter((m) => !m.is_bot).length;
  if (humanCount >= 4) return jsonError("ROOM_FULL", "That room is full.", 409);

  const nameTaken = members.some(
    (m) => !m.is_bot && m.display_name.toLowerCase() === displayName.toLowerCase(),
  );
  if (nameTaken) return jsonError("DUPLICATE_NAME", "That username is taken in this room.", 409);

  const takenSeats = new Set(members.map((m) => m.seat_index));
  const seat = ([0, 1, 2, 3] as const).find((s) => !takenSeats.has(s));
  if (seat === undefined) return jsonError("ROOM_FULL", "That room is full.", 409);

  // Only allow joining mid-match as a rejoin; new seats join the lobby.
  if (room.status === "playing") {
    return jsonError("MATCH_IN_PROGRESS", "That match already started. Ask the host for a rematch.", 409);
  }

  const { error } = await admin.from("room_members").insert({
    room_id: room.id,
    user_id: user.id,
    seat_index: seat,
    display_name: displayName,
    ready: false,
    team_id: teamForSeat(room.mode, seat),
    is_bot: false,
    is_host: false,
  });
  if (error) {
    if (error.code === "23505") {
      return jsonError("SEAT_TAKEN", "That seat was just taken. Try again.", 409);
    }
    return jsonError("SERVER_ERROR", "Could not join the room.", 500);
  }
  return jsonOk({ roomId: room.id, seat });
}
