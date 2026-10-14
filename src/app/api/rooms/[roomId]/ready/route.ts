import { readySchema } from "@/lib/schemas/room";
import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { adminClient } from "@/lib/supabase/admin.server";
import { getMembership, getRoom } from "@/lib/server/rooms";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in first.", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("BAD_REQUEST", "Invalid JSON.", 400);
  }
  const parsed = readySchema.safeParse(body);
  if (!parsed.success) return jsonError("BAD_REQUEST", "Invalid input.", 400);

  const room = await getRoom(roomId);
  if (!room) return jsonError("ROOM_NOT_FOUND", "Room not found.", 404);
  const me = await getMembership(roomId, user.id);
  if (!me || me.is_bot) return jsonError("FORBIDDEN", "You are not a member of this room.", 403);

  const admin = adminClient();
  await admin
    .from("room_members")
    .update({ ready: parsed.data.ready })
    .eq("room_id", roomId)
    .eq("user_id", user.id);
  return jsonOk({ ready: parsed.data.ready });
}
