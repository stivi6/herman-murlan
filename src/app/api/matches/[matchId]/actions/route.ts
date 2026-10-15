import { after } from "next/server";
import { matchActionSchema } from "@/lib/schemas/room";
import { engineCodeToHttp, jsonError, jsonOk, requireUser } from "@/lib/api/auth";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { adminClient } from "@/lib/supabase/admin.server";
import {
  getMembership,
  getRoom,
  listMembers,
  loadSession,
  teamForSeat,
} from "@/lib/server/rooms";
import { toPublicSnapshot, type SeatMeta } from "@/lib/server/snapshots";
import { applyAction, type GameAction } from "@/lib/game/transitions";
import type { MatchState, Seat } from "@/lib/game/state";
import { runBotTurns, syncRoomStatus } from "@/lib/server/gameplay";
import type { Json } from "@/lib/supabase/database";

export async function POST(req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("NOT_CONFIGURED", "Supabase is not configured.", 503);
  }
  const user = await requireUser();
  if (!user) return jsonError("UNAUTHENTICATED", "Sign in first.", 401);
  if (!rateLimit(`act:${clientKey(req, user.id)}`, 60, 60_000)) {
    return jsonError("RATE_LIMITED", "Too many actions. Slow down.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("BAD_REQUEST", "Invalid JSON.", 400);
  }
  const parsed = matchActionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid action.", 400);
  }
  const { actionId, expectedVersion, action } = parsed.data;

  const admin = adminClient();

  // Idempotency first: return the original receipt without re-applying.
  // Runs in parallel with the session load (independent reads).
  const [existingRes, loaded] = await Promise.all([
    admin
      .from("game_action_receipts")
      .select("*")
      .eq("match_id", matchId)
      .eq("actor_user_id", user.id)
      .eq("action_id", actionId)
      .maybeSingle(),
    loadSession(matchId),
  ]);
  const existing = existingRes.data;
  if (existing) {
    return jsonOk({
      duplicate: true,
      version: (existing as { resulting_version: number }).resulting_version,
      snapshotVersion: loaded?.version ?? null,
    });
  }

  if (!loaded) return jsonError("MATCH_NOT_FOUND", "Match not found.", 404);
  // Room, membership and member list are independent reads: one round trip.
  const [room, me, members] = await Promise.all([
    getRoom(loaded.state.roomId),
    getMembership(loaded.state.roomId, user.id),
    listMembers(loaded.state.roomId),
  ]);
  if (!room) return jsonError("ROOM_NOT_FOUND", "Room not found.", 404);
  if (!me || me.is_bot) return jsonError("FORBIDDEN", "You are not a player in this room.", 403);

  const mySeat = me.seat_index as Seat;

  // Translate the intent into an engine action bound to the caller's OWN seat.
  // Client-supplied seat/user fields are ignored (SPEC §5/§8).
  let engineAction: GameAction;
  if (action.type === "play") {
    engineAction = { type: "play", seat: mySeat, cardIds: [...action.cardIds].sort() };
  } else if (action.type === "pass") {
    engineAction = { type: "pass", seat: mySeat };
  } else {
    engineAction = { type: "exchangeSelect", seat: mySeat, cardId: action.cardId };
  }

  // Stale version: do not mutate; tell the client to refetch.
  if (loaded.version !== expectedVersion) {
    await admin.from("game_action_receipts").insert({
      match_id: matchId,
      actor_user_id: user.id,
      action_id: actionId,
      result: "rejected",
      resulting_version: loaded.version,
      response: { code: "STALE_STATE", version: loaded.version },
    });
    return jsonError("STALE_STATE", "Another move was accepted first. Refresh and try again.", 409, {
      version: loaded.version,
    });
  }

  const transition = applyAction(loaded.state, engineAction);
  if (!transition.ok) {
    await admin.from("game_action_receipts").insert({
      match_id: matchId,
      actor_user_id: user.id,
      action_id: actionId,
      result: "rejected",
      resulting_version: loaded.version,
      response: { code: transition.error.code, version: loaded.version },
    });
    return jsonError(transition.error.code, transition.error.message, engineCodeToHttp(transition.error.code), {
      version: loaded.version,
    });
  }

  const next: MatchState = transition.value;
  const ordered = [...members].sort((a, b) => a.seat_index - b.seat_index);
  const seatMeta = ordered.map((m) => ({
    displayName: m.display_name,
    team: (m.team_id as 0 | 1 | null) ?? teamForSeat(room.mode, m.seat_index),
    connected: m.presence_status !== "offline",
    isBot: m.is_bot,
  })) as [SeatMeta, SeatMeta, SeatMeta, SeatMeta];
  const snapshot = toPublicSnapshot(next, seatMeta);

  const eventKind =
    engineAction.type === "play"
      ? "play"
      : engineAction.type === "pass"
        ? "pass"
        : "exchange";
  // Public event payload only — never hands or deck.
  const eventPayload =
    engineAction.type === "play"
      ? { seat: mySeat, cardIds: next.currentCombo?.cardIds ?? engineAction.cardIds }
      : engineAction.type === "pass"
        ? { seat: mySeat }
        : { seat: mySeat };

  const { data: commit, error: commitError } = await admin.rpc("commit_match_transition", {
    p_session_id: matchId,
    p_expected_version: expectedVersion,
    p_action_id: actionId,
    p_actor_id: user.id,
    p_accepted: true,
    p_new_version: next.version,
    p_new_private: next as unknown as Json,
    p_new_snapshot: snapshot as unknown as Json,
    p_event_kind: eventKind,
    p_event_payload: eventPayload as unknown as Json,
  });
  if (commitError) {
    return jsonError("SERVER_ERROR", "Could not commit the move. Try again.", 500);
  }
  const result = commit as { ok: boolean; code?: string; duplicate?: boolean; version: number };
  if (!result.ok && result.code === "STALE_STATE") {
    return jsonError("STALE_STATE", "Another move was accepted first. Refresh and try again.", 409, {
      version: result.version,
    });
  }

  // Post-commit side effects run AFTER the response so the player's tap feels
  // instant: the human's move is already committed at this point. Bots then
  // advance via background work + opportunistic triggers in GET snapshot.
  // NOTE: handResult is intentionally NOT auto-advanced: every member must
  // have a chance to see the hand-result overlay; any member advances via
  // POST /advance (Continue button). Bots wait patiently.
  try {
    if (next.status === "finished" || next.status === "cancelled") {
      await syncRoomStatus(room.id, next.status);
    } else if (next.status === "playing" || next.status === "exchange") {
      after(() => runBotTurns(matchId));
    }
  } catch {
    // Background scheduling must never fail the accepted move. The snapshot
    // endpoint re-triggers bot turns opportunistically as a safety net.
    try {
      void runBotTurns(matchId);
    } catch {
      // ignore
    }
  }

  return jsonOk({ version: next.version, duplicate: result.duplicate ?? false });
}
