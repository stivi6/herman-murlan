/**
 * Typed fetch wrappers for the Murlan API. Used by client components.
 * All errors surface as ApiError with a stable code + message.
 */

export class ApiError extends Error {
  code: string;
  status: number;
  version?: number;
  constructor(code: string, message: string, status: number, version?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.version = version;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("NETWORK", "Network error. Check your connection.", 0);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok || body.ok === false) {
    throw new ApiError(
      (body.code as string) ?? "SERVER_ERROR",
      (body.message as string) ?? `Request failed (${res.status}).`,
      res.status,
      body.version as number | undefined,
    );
  }
  return body as T;
}

export interface CreateRoomResponse {
  roomId: string;
  code: string;
}
export function createRoom(displayName: string, mode: "ffa" | "2v2", allowBots: boolean) {
  return request<CreateRoomResponse>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ displayName, mode, allowBots }),
  });
}

export interface JoinRoomResponse {
  roomId: string;
  seat: number;
  rejoined?: boolean;
}
export function joinRoom(code: string, displayName: string) {
  return request<JoinRoomResponse>("/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({ code, displayName }),
  });
}

export interface RoomMemberView {
  userId: string | null;
  seat: number;
  displayName: string;
  ready: boolean;
  team: 0 | 1 | null;
  isBot: boolean;
  isHost: boolean;
  presence: string;
}
export interface RoomView {
  room: {
    id: string;
    code: string;
    mode: "ffa" | "2v2";
    status: string;
    hostUserId: string;
    currentMatchId: string | null;
    allowBots: boolean;
  };
  members: RoomMemberView[];
  mySeat: number;
  isHost: boolean;
}
export function getRoom(roomId: string) {
  return request<RoomView>(`/api/rooms/${roomId}`);
}

export function setReady(roomId: string, ready: boolean) {
  return request<{ ready: boolean }>(`/api/rooms/${roomId}/ready`, {
    method: "POST",
    body: JSON.stringify({ ready }),
  });
}

export function startMatch(roomId: string, allowBots?: boolean) {
  return request<{ matchId: string; openingSeat: number }>(`/api/rooms/${roomId}/start`, {
    method: "POST",
    body: JSON.stringify(allowBots === undefined ? {} : { allowBots }),
  });
}

export function leaveRoom(roomId: string) {
  return request<{ left: boolean }>(`/api/rooms/${roomId}/leave`, { method: "POST", body: "{}" });
}

export function sendHeartbeat(roomId: string, presence: string) {
  return request<{ seen: boolean }>(`/api/rooms/${roomId}/heartbeat`, {
    method: "POST",
    body: JSON.stringify({ presence }),
  });
}

export function rematchToLobby(roomId: string) {
  return request<{ toLobby: boolean }>(`/api/rooms/${roomId}/rematch`, {
    method: "POST",
    body: "{}",
  });
}

export function endMatch(roomId: string) {
  return request<{ ended: boolean }>(`/api/rooms/${roomId}/end-match`, {
    method: "POST",
    body: "{}",
  });
}

export interface SnapshotCard {
  id: string;
  rank: string;
  suit: string | null;
  isJoker: boolean;
}
export interface SnapshotSeat {
  seat: number;
  displayName: string;
  team: 0 | 1 | null;
  connected: boolean;
  isBot: boolean;
  cardsRemaining: number;
  score: number;
  passed: boolean;
  finished: boolean;
  placement: number;
  isTurn: boolean;
}
export interface MatchSnapshot {
  matchId: string;
  roomId: string;
  version: number;
  status: string;
  mode: "ffa" | "2v2";
  handNumber: number;
  target: number;
  scores: [number, number, number, number];
  teamTotals: [number, number] | null;
  seats: SnapshotSeat[];
  currentActor: number | null;
  currentCombo: { type: string; cardIds: string[]; playedBy: number } | null;
  history: { type: string; cardIds: string[]; playedBy: number }[];
  isFirstHand: boolean;
  openingPending: boolean;
  exchange: {
    firstSeat: number;
    fourthSeat: number;
    receivedCardId: string | null;
    needsReturnFrom: number | null;
  } | null;
  placements: [number, number, number, number] | null;
  lastHandPlacements: [number, number, number, number] | null;
  winner: number | null;
  tie: boolean;
  tied: number[];
  nextLeader: number | null;
  mySeat: number | null;
  myCards: SnapshotCard[];
  canAct: boolean;
  isHost: boolean;
}

export function getSnapshot(matchId: string) {
  return request<{ snapshot: MatchSnapshot }>(`/api/matches/${matchId}/snapshot`);
}

export type ClientIntent =
  | { type: "play"; cardIds: string[] }
  | { type: "pass" }
  | { type: "exchangeSelect"; cardId: string };

export function sendAction(matchId: string, actionId: string, expectedVersion: number, action: ClientIntent) {
  return request<{ version: number; duplicate?: boolean }>(`/api/matches/${matchId}/actions`, {
    method: "POST",
    body: JSON.stringify({ actionId, expectedVersion, action }),
  });
}

export function advanceHand(matchId: string) {
  return request<{ status: string; version: number }>(`/api/matches/${matchId}/advance`, {
    method: "POST",
    body: "{}",
  });
}
