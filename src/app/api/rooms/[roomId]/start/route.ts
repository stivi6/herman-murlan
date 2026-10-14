import { randomUUID } from "node:crypto";
import { startMatchSchema } from "@/lib/schemas/room";
import { jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { adminClient } from "@/lib/supabase/admin.server";
import { dealNewHands, randomStartSeat } from "@/lib/server/deal";
import { getMembership, getRoom, listMembers, teamForSeat } from "@/lib/server/rooms";
import { createInitialMatchState } from "@/lib/game/state";
import { startHandWithHands } from "@/lib/game/transitions";
import { toPublicSnapshot, type SeatMeta } from "@/lib/server/snapshots";
import type { Json } from "@/lib/supabase/database";
import { runBotTurns } from "@/lib/server/gameplay";

const BOT_NAMES = ["Boti", "Gerti", "Anila", "Pellumbi"];

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in first.", 401);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = startMatchSchema.safeParse(body);
  if (!parsed.success) return jsonError("BAD_REQUEST", "Invalid input.", 400);

  const room = await getRoom(roomId);
  if (!room) return jsonError("ROOM_NOT_FOUND", "Room not found.", 404);
  const me = await getMembership(roomId, user.id);
  if (!me) return jsonError("FORBIDDEN", "You are not a member of this room.", 403);
  if (!me.is_host) return jsonError("HOST_ONLY", "Only the host can start the match.", 403);
  if (room.status === "playing") {
    return jsonError("ALREADY_STARTED", "The match already started.", 409);
  }

  const admin = adminClient();
  let members = await listMembers(roomId);
  const humans = members.filter((m) => !m.is_bot);
  if (humans.length < 1) return jsonError("NO_PLAYERS", "At least one human must be present.", 400);
  if (!humans.every((m) => m.ready)) {
    return jsonError("NOT_READY", "All human players must be ready.", 409);
  }

  const allowBots = parsed.data.allowBots ?? (room.settings as { allowBots?: boolean })?.allowBots ?? false;
  // Persist the host's bot-fill choice on the room.
  await admin
    .from("rooms")
    .update({ settings: { ...(room.settings as object), allowBots }, mode: room.mode })
    .eq("id", roomId);

  const need = 4 - humans.length;
  if (need > 0 && !allowBots) {
    return jsonError("NEED_FOUR", "Four ready humans are required (or enable bot fill).", 409);
  }
  // Fill empty seats with bots after explicit host consent.
  if (need > 0 && allowBots) {
    const taken = new Set(members.map((m) => m.seat_index));
    const free = ([0, 1, 2, 3] as const).filter((s) => !taken.has(s));
    for (let i = 0; i < need; i++) {
      const seat = free[i];
      await admin.from("room_members").insert({
        room_id: roomId,
        user_id: randomUUID(),
        seat_index: seat,
        display_name: BOT_NAMES[seat % BOT_NAMES.length],
        ready: true,
        team_id: teamForSeat(room.mode, seat),
        is_bot: true,
        is_host: false,
      });
    }
    members = await listMembers(roomId);
  }
  if (members.length !== 4) {
    return jsonError("NEED_FOUR", "Four seats are required to start.", 409);
  }

  // Build the initial match state (server-dealt).
  const matchId = randomUUID();
  const ordered = [...members].sort((a, b) => a.seat_index - b.seat_index);
  const hands = dealNewHands(randomStartSeat());
  // Sort each hand for stable storage (display sorting is client-local).
  for (const h of hands) {
    h.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  let state = createInitialMatchState({
    matchId,
    roomId,
    mode: room.mode as "ffa" | "2v2",
  });
  state = startHandWithHands(state, hands, { handNumber: 1, isFirstHand: true });

  const seatMeta = ordered.map((m) => ({
    displayName: m.display_name,
    team: (m.team_id as 0 | 1 | null) ?? teamForSeat(room.mode, m.seat_index),
    connected: true,
    isBot: m.is_bot,
  })) as [SeatMeta, SeatMeta, SeatMeta, SeatMeta];
  const snapshot = toPublicSnapshot(state, seatMeta);

  const { error: sessErr } = await admin.from("game_sessions").insert({
    id: matchId,
    room_id: roomId,
    schema_version: 1,
    version: state.version,
    status: state.status,
    private_state: state as unknown as Json,
  });
  if (sessErr) return jsonError("SERVER_ERROR", "Could not create the match.", 500);
  await admin.from("match_public_snapshots").insert({
    match_id: matchId,
    room_id: roomId,
    version: state.version,
    snapshot: snapshot as unknown as Json,
  });
  await admin.from("rooms").update({ status: "playing", current_match_id: matchId }).eq("id", roomId);
  await admin.from("game_events").insert({
    match_id: matchId,
    room_id: roomId,
    version: state.version,
    kind: "match_started",
    payload: { hand: 1, mode: room.mode },
  });

  // If the opening seat is a bot (S3 holder), play bot turns immediately.
  await runBotTurns(matchId);

  return jsonOk({ matchId, openingSeat: state.currentActor });
}

export async function GET() {
  return jsonError("NOT_FOUND", "Use POST to start.", 404);
}
