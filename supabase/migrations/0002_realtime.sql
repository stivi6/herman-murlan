-- Enable Realtime notifications for public snapshots + events.
-- Clients subscribe to these rows (member-filtered by RLS) and then fetch
-- their own authorized snapshot (which adds their private hand separately).
-- Realtime payloads never contain hidden hands: snapshots hold only public
-- data by construction (see toPublicSnapshot).

alter publication supabase_realtime add table public.match_public_snapshots;
alter publication supabase_realtime add table public.game_events;
