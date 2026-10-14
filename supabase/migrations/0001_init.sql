-- Murlan initial schema (SPEC §6). Versioned migration 0001.
-- Private friend rooms: rooms, room_members, game_sessions (server-only),
-- match_public_snapshots (member-readable), game_action_receipts, game_events.

create extension if not exists "pgcrypto";

-- Rooms ---------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null,
  mode text not null default 'ffa' check (mode in ('ffa', '2v2')),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  current_match_id uuid,
  settings jsonb not null default '{"allowBots": false}'::jsonb
);
create index rooms_code_idx on public.rooms (code);
create index rooms_status_idx on public.rooms (status);
create index rooms_expires_idx on public.rooms (expires_at);

-- Members -------------------------------------------------------------
create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  seat_index smallint not null check (seat_index between 0 and 3),
  display_name text not null check (char_length(display_name) between 1 and 18),
  ready boolean not null default false,
  team_id smallint check (team_id in (0, 1)),
  is_bot boolean not null default false,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  presence_status text not null default 'online' check (presence_status in ('online', 'reconnecting', 'offline')),
  primary key (room_id, user_id),
  unique (room_id, seat_index)
);
create unique index room_members_name_ci_idx on public.room_members (room_id, lower(display_name));
create index room_members_user_idx on public.room_members (user_id);

-- Server-only authoritative sessions ----------------------------------
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  schema_version smallint not null default 1,
  version integer not null default 0,
  status text not null default 'playing' check (status in ('playing', 'exchange', 'handResult', 'finished', 'cancelled')),
  private_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index game_sessions_room_idx on public.game_sessions (room_id);

-- Public snapshots (member-readable, server-written) -------------------
create table public.match_public_snapshots (
  match_id uuid primary key references public.game_sessions (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  version integer not null default 0,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
create index match_snapshots_room_idx on public.match_public_snapshots (room_id);

-- Idempotency receipts -------------------------------------------------
create table public.game_action_receipts (
  match_id uuid not null references public.game_sessions (id) on delete cascade,
  actor_user_id uuid not null,
  action_id uuid not null,
  result text not null check (result in ('accepted', 'rejected')),
  resulting_version integer,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (match_id, actor_user_id, action_id)
);
create index receipts_match_idx on public.game_action_receipts (match_id);

-- Public append-only events -------------------------------------------
create table public.game_events (
  id bigserial primary key,
  match_id uuid not null references public.game_sessions (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  version integer not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index game_events_match_idx on public.game_events (match_id, version);

-- RLS ------------------------------------------------------------------
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.game_sessions enable row level security;
alter table public.match_public_snapshots enable row level security;
alter table public.game_action_receipts enable row level security;
alter table public.game_events enable row level security;

-- No direct client access to authoritative state or receipts.
create policy "deny all game_sessions" on public.game_sessions for all
  using (false) with check (false);
create policy "deny all receipts" on public.game_action_receipts for all
  using (false) with check (false);

-- Members can read their room row and the member list of rooms they belong to.
create policy "members read own rooms" on public.rooms for select
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = rooms.id and m.user_id = auth.uid()
    )
  );

create policy "members read member list" on public.room_members for select
  using (
    exists (
      select 1 from public.room_members me
      where me.room_id = room_members.room_id and me.user_id = auth.uid()
    )
  );

-- Members can read public snapshots + events of their rooms only.
create policy "members read snapshots" on public.match_public_snapshots for select
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = match_public_snapshots.room_id and m.user_id = auth.uid()
    )
  );

create policy "members read events" on public.game_events for select
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = game_events.room_id and m.user_id = auth.uid()
    )
  );

-- All writes go through the service role (server Route Handlers / RPC with
-- SECURITY DEFINER below). No client insert/update/delete policies are added.

-- Atomic compare-and-swap commit ---------------------------------------
-- Called only with the service role. Applies one validated transition:
-- locks the session row, checks expectedVersion, records the receipt,
-- advances private state + public snapshot + event in a single transaction.
create or replace function public.commit_match_transition(
  p_session_id uuid,
  p_expected_version integer,
  p_action_id uuid,
  p_actor_id uuid,
  p_accepted boolean,
  p_new_version integer,
  p_new_private jsonb,
  p_new_snapshot jsonb,
  p_event_kind text,
  p_event_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_existing text;
begin
  select version into v_current from public.game_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select result into v_existing from public.game_action_receipts
    where match_id = p_session_id and actor_user_id = p_actor_id and action_id = p_action_id;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'version', v_current);
  end if;

  if v_current != p_expected_version then
    insert into public.game_action_receipts (match_id, actor_user_id, action_id, result, resulting_version, response)
      values (p_session_id, p_actor_id, p_action_id, 'rejected', v_current,
              jsonb_build_object('code', 'STALE_STATE'));
    return jsonb_build_object('ok', false, 'code', 'STALE_STATE', 'version', v_current);
  end if;

  if p_accepted then
    update public.game_sessions
      set private_state = p_new_private,
          version = p_new_version,
          status = coalesce(p_new_private->>'status', status),
          updated_at = now()
      where id = p_session_id;
    update public.match_public_snapshots
      set snapshot = p_new_snapshot, version = p_new_version, updated_at = now()
      where match_id = p_session_id;
    insert into public.game_events (match_id, room_id, version, kind, payload)
      select p_session_id, room_id, p_new_version, p_event_kind, coalesce(p_event_payload, '{}'::jsonb)
      from public.game_sessions where id = p_session_id;
  end if;

  insert into public.game_action_receipts (match_id, actor_user_id, action_id, result, resulting_version, response)
    values (p_session_id, p_actor_id, p_action_id,
            case when p_accepted then 'accepted' else 'rejected' end,
            case when p_accepted then p_new_version else v_current end,
            jsonb_build_object('version', case when p_accepted then p_new_version else v_current end));

  return jsonb_build_object('ok', true, 'duplicate', false, 'version',
    case when p_accepted then p_new_version else v_current end);
end;
$$;

revoke all on function public.commit_match_transition from public, anon, authenticated;
