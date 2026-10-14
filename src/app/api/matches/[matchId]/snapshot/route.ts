import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { adminClient } from "@/lib/supabase/admin.server";
import {
  getMembership,
  getRoom,
  listMembers,
  loadSession,
  teamForSeat,
} from "@/lib/server/rooms";
import { runBotTurns } from "@/lib/server/gameplay";
import { toPrivateSnapshot, type SeatMeta } from "@/lib/server/snapshots";
import type { Seat } from "@/lib/game/state";

export async function GET(_req: Request, ctx: { params: Promise<{ matchId: string }> }) {
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
  if (!me) return jsonError("FORBIDDEN", "You are not a member of this room.", 403);

  const members = await listMembers(room.id);
  const ordered = [...members].sort((a, b) => a.seat_index - b.seat_index);
  const seatMeta = ordered.map((m) => ({
    displayName: m.display_name,
    team: (m.team_id as 0 | 1 | null) ?? teamForSeat(room.mode, m.seat_index),
    connected: m.presence_status !== "offline",
    isBot: m.is_bot,
  })) as [SeatMeta, SeatMeta, SeatMeta, SeatMeta];

  const mySeat = me.is_bot ? null : (me.seat_index as Seat);
  const snapshot = toPrivateSnapshot(loaded.state, seatMeta, mySeat, me.is_host);

  // Touch presence on snapshot reads (cheap reconnect recovery signal).
  const admin = adminClient();
  await admin
    .from("room_members")
    .update({ last_seen_at: new Date().toISOString(), presence_status: "online" })
    .eq("room_id", room.id)
    .eq("user_id", user.id);

  // Safety net: if a bot must act, advance it without blocking this response.
  // (The actions route schedules the same work via after(); this covers the
  // case where background work was frozen.) Compare-and-swap makes concurrent
  // triggers safe: losers simply reload and continue.
  const needsBot =
    (loaded.state.status === "playing" &&
      loaded.state.currentActor !== null &&
      members.some((m) => m.seat_index === loaded.state.currentActor && m.is_bot)) ||
    (loaded.state.status === "exchange" &&
      loaded.state.exchange !== null &&
      !loaded.state.exchange.resolved &&
      members.some((m) => m.seat_index === loaded.state.exchange!.firstSeat && m.is_bot));
  if (needsBot) {
    void runBotTurns(matchId).catch(() => undefined);
  }

  return jsonOk({ snapshot });
}
