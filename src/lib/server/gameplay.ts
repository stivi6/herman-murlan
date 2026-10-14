/**
 * Server-side gameplay side effects: bot turns + next-hand auto-advance.
 * Used by the start/actions routes. Server-only (service role + engine).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin.server";
import { dealNewHands, randomStartSeat } from "@/lib/server/deal";
import {
  getRoom,
  listMembers,
  loadSession,
  teamForSeat,
  type MemberRow,
} from "@/lib/server/rooms";
import { toPublicSnapshot, type SeatMeta } from "@/lib/server/snapshots";
import { applyAction, setupNextHandExchange } from "@/lib/game/transitions";
import { chooseBotExchangeReturn, chooseBotMove } from "@/lib/game/bot";
import type { MatchState } from "@/lib/game/state";
import type { Json } from "@/lib/supabase/database";

const NIL_ACTOR = "00000000-0000-0000-0000-000000000000";

function seatMetaFor(members: MemberRow[], mode: string): [SeatMeta, SeatMeta, SeatMeta, SeatMeta] {
  const ordered = [...members].sort((a, b) => a.seat_index - b.seat_index);
  return ordered.map((m) => ({
    displayName: m.display_name,
    team: (m.team_id as 0 | 1 | null) ?? teamForSeat(mode, m.seat_index),
    connected: m.presence_status !== "offline",
    isBot: m.is_bot,
  })) as [SeatMeta, SeatMeta, SeatMeta, SeatMeta];
}

async function commitServerTransition(
  matchId: string,
  expectedVersion: number,
  next: MatchState,
  members: MemberRow[],
  mode: string,
  eventKind: string,
): Promise<void> {
  const admin = adminClient();
  const snapshot = toPublicSnapshot(next, seatMetaFor(members, mode));
  await admin.rpc("commit_match_transition", {
    p_session_id: matchId,
    p_expected_version: expectedVersion,
    p_action_id: randomUUID(),
    p_actor_id: NIL_ACTOR,
    p_accepted: true,
    p_new_version: next.version,
    p_new_private: next as unknown as Json,
    p_new_snapshot: snapshot as unknown as Json,
    p_event_kind: eventKind,
    p_event_payload: { version: next.version } as unknown as Json,
  });
}

/** Advance bot turns until a human must act or the hand/match ends. */
export async function runBotTurns(matchId: string): Promise<void> {
  // Discover the room from the session, then load room + members once (they
  // change rarely mid-hand; refreshed periodically). The session itself is
  // reloaded every iteration for a fresh compare-and-swap version.
  const first = await loadSession(matchId);
  if (!first) return;
  let room = await getRoom(first.room_id);
  let members = room ? await listMembers(room.id) : [];
  for (let guard = 0; guard < 60; guard++) {
    if (guard > 0) {
      if (guard % 10 === 0) {
        room = await getRoom(first.room_id);
        if (room) members = await listMembers(room.id);
      }
    }
    const loaded = guard === 0 ? first : await loadSession(matchId);
    if (!loaded || !room) return;
    const { state } = loaded;
    if (state.status === "finished" || state.status === "cancelled") return;

    if (state.status === "exchange" && state.exchange && !state.exchange.resolved) {
      const firstMember = members.find((m) => m.seat_index === state.exchange!.firstSeat);
      if (!firstMember?.is_bot) return;
      const cardId = chooseBotExchangeReturn(state.hands[state.exchange.firstSeat]);
      const r = applyAction(state, {
        type: "exchangeSelect",
        seat: state.exchange.firstSeat,
        cardId,
      });
      if (!r.ok) return;
      await commitServerTransition(matchId, loaded.version, r.value, members, room.mode, "exchange");
      continue;
    }

    if (state.status === "handResult") return;
    if (state.status !== "playing" || state.currentActor === null) return;

    const actorMember = members.find((m) => m.seat_index === state.currentActor);
    if (!actorMember?.is_bot) return;

    const seat = state.currentActor;
    const decision = chooseBotMove({
      hand: state.hands[seat],
      table: state.currentCombo,
      leading: state.currentCombo === null,
      mustIncludeS3: state.isFirstHand && state.openingPending,
    });
    const action =
      decision.kind === "pass"
        ? ({ type: "pass", seat } as const)
        : ({ type: "play", seat, cardIds: decision.cardIds } as const);
    let r = applyAction(state, action);
    if (!r.ok && state.currentCombo === null) {
      // Bot chose pass while leading (shouldn't happen) — force lowest single.
      const lowest = [...state.hands[seat]].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      const ids =
        state.isFirstHand && state.openingPending ? ["S3"] : [lowest.id];
      r = applyAction(state, { type: "play", seat, cardIds: ids });
    }
    if (!r.ok) return;
    await commitServerTransition(matchId, loaded.version, r.value, members, room.mode, "bot_move");
    // If this ended the hand, status becomes handResult and the loop exits at
    // the top of the next iteration: humans tap Continue to deal the next hand.
  }
}

/** Deal the next hand after handResult (when the match continues). */
export async function autoAdvanceHand(matchId: string): Promise<boolean> {
  const admin = adminClient();
  const loaded = await loadSession(matchId);
  if (!loaded || loaded.state.status !== "handResult") return false;
  const room = await getRoom(loaded.room_id);
  if (!room) return false;
  const members = await listMembers(loaded.room_id);
  const dealt = dealNewHands(randomStartSeat());
  const r = setupNextHandExchange(loaded.state, dealt);
  if (!r.ok) return false;
  const next = r.value;
  const snapshot = toPublicSnapshot(next, seatMetaFor(members, room.mode));
  await admin.rpc("commit_match_transition", {
    p_session_id: matchId,
    p_expected_version: loaded.version,
    p_action_id: randomUUID(),
    p_actor_id: NIL_ACTOR,
    p_accepted: true,
    p_new_version: next.version,
    p_new_private: next as unknown as Json,
    p_new_snapshot: snapshot as unknown as Json,
    p_event_kind: "hand_dealt",
    p_event_payload: { hand: next.handNumber } as unknown as Json,
  });
  // Bots advance via the caller's after()/snapshot safety net (same as actions).
  return true;
}

/** Mark the room finished when the match reached a terminal state. */
export async function syncRoomStatus(roomId: string, matchStatus: string): Promise<void> {
  if (matchStatus !== "finished" && matchStatus !== "cancelled") return;
  const admin = adminClient();
  await admin.from("rooms").update({ status: matchStatus }).eq("id", roomId);
}
