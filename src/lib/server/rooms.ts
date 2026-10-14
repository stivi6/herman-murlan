import "server-only";
import { adminClient } from "@/lib/supabase/admin.server";
import {
  STATE_SCHEMA_VERSION,
  type MatchState,
  type Seat,
} from "@/lib/game/state";
import { cardFromId } from "@/lib/game/cards";

export interface RoomRow {
  id: string;
  code: string;
  host_user_id: string;
  mode: "ffa" | "2v2";
  status: string;
  created_at: string;
  expires_at: string;
  current_match_id: string | null;
  settings: { allowBots?: boolean };
}

export interface MemberRow {
  room_id: string;
  user_id: string;
  seat_index: number;
  display_name: string;
  ready: boolean;
  team_id: number | null;
  is_bot: boolean;
  is_host: boolean;
  joined_at: string;
  last_seen_at: string;
  presence_status: string;
}

/** Rebuild Card objects after JSONB round-trip + validate schema version. */
export function parseMatchState(raw: unknown): MatchState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as MatchState;
  if (s.schemaVersion !== STATE_SCHEMA_VERSION) return null;
  if (!Array.isArray(s.hands) || s.hands.length !== 4) return null;
  try {
    const hands = s.hands.map((h) =>
      (h as unknown[]).map((c) => {
        if (typeof c === "string") return cardFromId(c);
        const card = c as { id: string };
        return cardFromId(card.id);
      }),
    ) as [typeof s.hands[0], typeof s.hands[1], typeof s.hands[2], typeof s.hands[3]];
    return { ...s, hands };
  } catch {
    return null;
  }
}

export function serializeMatchState(state: MatchState): unknown {
  return state;
}

export async function getRoom(roomId: string): Promise<RoomRow | null> {
  const admin = adminClient();
  const { data } = await admin.from("rooms").select("*").eq("id", roomId).single();
  return (data as RoomRow | null) ?? null;
}

export async function getRoomByCode(code: string): Promise<RoomRow | null> {
  const admin = adminClient();
  const { data } = await admin.from("rooms").select("*").eq("code", code).single();
  return (data as RoomRow | null) ?? null;
}

export async function listMembers(roomId: string): Promise<MemberRow[]> {
  const admin = adminClient();
  const { data } = await admin
    .from("room_members")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_index");
  return ((data ?? []) as MemberRow[]).sort((a, b) => a.seat_index - b.seat_index);
}

export async function getMembership(roomId: string, userId: string): Promise<MemberRow | null> {
  const admin = adminClient();
  const { data } = await admin
    .from("room_members")
    .select("*")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as MemberRow | null) ?? null;
}

export function seatOf(members: MemberRow[], userId: string): Seat | null {
  const m = members.find((x) => x.user_id === userId && !x.is_bot);
  return m ? (m.seat_index as Seat) : null;
}

export function teamForSeat(mode: string, seat: number): 0 | 1 | null {
  if (mode !== "2v2") return null;
  return seat % 2 === 0 ? 0 : 1;
}

export async function loadSession(
  matchId: string,
): Promise<{ version: number; status: string; room_id: string; state: MatchState } | null> {
  const admin = adminClient();
  const { data } = await admin.from("game_sessions").select("*").eq("id", matchId).single();
  if (!data) return null;
  const state = parseMatchState((data as { private_state: unknown }).private_state);
  if (!state) return null;
  return {
    version: (data as { version: number }).version,
    status: (data as { status: string }).status,
    room_id: (data as { room_id: string }).room_id,
    state,
  };
}
