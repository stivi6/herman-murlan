import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { adminClient } from "@/lib/supabase/admin.server";
import { getMembership } from "@/lib/server/rooms";

/** Presence heartbeat — keeps last_seen_at fresh; rate-limited client-side. */
export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in first.", 401);

  let presence: string | undefined;
  try {
    const body = await req.json();
    presence = (body as { presence?: string })?.presence;
  } catch {
    presence = undefined;
  }
  const status = presence === "reconnecting" ? "reconnecting" : "online";

  const me = await getMembership(roomId, user.id);
  if (!me) return jsonError("FORBIDDEN", "Not a member.", 403);

  const admin = adminClient();
  await admin
    .from("room_members")
    .update({ last_seen_at: new Date().toISOString(), presence_status: status })
    .eq("room_id", roomId)
    .eq("user_id", user.id);
  return jsonOk({ seen: true });
}
