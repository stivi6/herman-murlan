import { createRoomSchema } from "@/lib/schemas/room";
import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { adminClient } from "@/lib/supabase/admin.server";
import { generateRoomCode, normalizeCode } from "@/lib/server/roomCode";
import { teamForSeat } from "@/lib/server/rooms";

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST(req: Request) {
  if (!configured()) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured on this deployment.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in (anonymous) first.", 401);
  if (!rateLimit(`create:${clientKey(req, user.id)}`, 10, 60_000)) {
    return jsonError("RATE_LIMITED", "Too many rooms created. Slow down.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("BAD_REQUEST", "Invalid JSON.", 400);
  }
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
  }
  const { displayName, mode, allowBots } = parsed.data;

  const admin = adminClient();
  // Unique room code with collision retry.
  let code = "";
  let room: { id: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateRoomCode();
    const { data, error } = await admin
      .from("rooms")
      .insert({
        code,
        host_user_id: user.id,
        mode,
        status: "lobby",
        settings: { allowBots },
      })
      .select("id")
      .single();
    if (!error) {
      room = data as { id: string };
      break;
    }
    // Assume collision; retry with a fresh code.
  }
  if (!room) return jsonError("SERVER_ERROR", "Could not create a room. Try again.", 500);

  const { error: memberError } = await admin.from("room_members").insert({
    room_id: room.id,
    user_id: user.id,
    seat_index: 0,
    display_name: displayName,
    ready: false,
    team_id: teamForSeat(mode, 0),
    is_bot: false,
    is_host: true,
  });
  if (memberError) {
    // Name race is unlikely for the first seat; surface duplicate-name errors.
    await admin.from("rooms").delete().eq("id", room.id);
    if (memberError.code === "23505") {
      return jsonError("DUPLICATE_NAME", "That username is taken in this room.", 409);
    }
    return jsonError("SERVER_ERROR", "Could not join the new room.", 500);
  }

  return jsonOk({ roomId: room.id, code: normalizeCode(code) });
}

export async function GET() {
  return jsonError("NOT_FOUND", "Use POST /api/rooms to create a room.", 404);
}
