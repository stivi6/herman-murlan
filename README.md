# Murlan — private multiplayer card game

A polished, browser-based Murlan table for one small group of friends. Four
seats per private room, Classic FFA or 2v2 partners, live sync, reconnect
recovery, and the exact rules in `SPEC.md`. This is **not** a public gaming
platform: no matchmaking, leaderboards, monetisation, or accounts beyond a
guest username + Supabase anonymous session.

## Stack

Next.js App Router + React + TypeScript (strict) · Tailwind CSS · Motion ·
Supabase (Postgres + anonymous Auth + Realtime) · Zod · Vitest + Playwright.

## Quick start (local)

1. Install dependencies:
   ```sh
   npm install
   ```
2. Create a Supabase project. Enable **anonymous sign-in**
   (Auth → Sign-In / Providers → Anonymous).
3. Run the SQL migrations in `supabase/migrations/` (in order) in the
   Supabase SQL editor, then confirm the RLS policies exist. `0002_realtime`
   adds the public snapshot/event tables to the Realtime publication.
4. Copy the environment template and fill it in (placeholders only in the repo):
   ```sh
   cp .env.example .env.local
   ```
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key)
   - `SUPABASE_SERVICE_ROLE_KEY` (**server-only**, never `NEXT_PUBLIC_*`)
5. Run the dev server and open four browser sessions (regular + incognito windows):
   ```sh
   npm run dev
   ```
6. Create a room in one session, share the code/link, join from the other three,
   ready up, and start.

Without Supabase credentials the app still builds and renders, but room/match
APIs return a clear `NOT_CONFIGURED` error instead of a fake game.

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add the three environment variables above (Production + Preview).
3. **Match regions for speed:** Supabase Dashboard → Project Settings → General
   shows your database region (e.g. West EU). Then Vercel → your project →
   Settings → Functions → Function Region → pick the closest one. Every tap
   costs a few database round trips, so same-continent placement is the single
   biggest latency win.
4. Deploy. Game routes run on the Node.js runtime.
4. Confirm the production site only exposes public snapshots: the browser
   network tab should never show other players' hands, the deck order, or the
   service-role key.

## How it works

- The browser submits **intent** (`play`, `pass`, `exchangeSelect`) with a
  UUID `actionId` + `expectedVersion`. The server validates the session, seat
  ownership, and the move with the pure rules engine, then commits through the
  atomic `commit_match_transition` RPC (compare-and-swap on the state version
  + idempotency receipt + public snapshot + event in one transaction).
- Realtime only notifies about new **public** versions; each client then
  fetches its own authorized snapshot (private hand included separately).
- Refresh/reload resumes the same seat via the persisted anonymous session.
  Seats are preserved on disconnect; there is no auto-pass and no turn timer.
  The host can end a stuck match (End button) and the room returns to the lobby.
- After each hand, the result overlay stays until a member taps Continue, which
  deals the next hand (or enters the 1st/4th card exchange).
- Bots (optional, host-enabled) use the same engine validation and only see
  their own hand + the public table.

## Decisions worth knowing

- **Supabase anonymous-sign-in rate limit:** Supabase caps anonymous sign-ins
  per IP per hour (default 30). Four friends are far below this, but friends
  on the same Wi-Fi share one public IP, and automated test runs can trip it
  (you'll see `429 over_request_rate_limit` / "Could not sign in"). Raise it
  under Authentication → Rate Limits if needed.

- **Passing while leading is illegal** (`PASS_NOT_ALLOWED_LEAD`): the trick
  leader must play. This is the isolated reading of SPEC §4.6 in
  `applyPass()` — change it in one place if the group confirms another variant.
- **2v2 scoring** is the documented house rule: individual 3/2/1/0 points are
  kept per player; each team's hand/match score is the sum of its partners.
- **Card faces** are original CSS/SVG rendering (see `THIRD_PARTY_NOTICES.md`).
- **Rate limiting** is a lightweight per-instance in-memory limiter
  (`src/lib/api/rate-limit.ts`); it blunts casual spam but is not a
  distributed abuse system. No external service was added, per the
  friend-group scope.

## Scripts

| Command | What it runs |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit + integration) |
| `npm run e2e` | Playwright (needs dev server + Supabase) |
| `npm run build` | Production build |

## Tests

- `tests/unit/` — card order, combination classification, scales, bombs,
  dealing, S3 opening, turns/passing, finishing, scoring/targets, exchange,
  2v2, randomized invariant fuzz (no lost/dup cards, only-actor-moves,
  scores never decrease, invalid leaves unchanged).
- `tests/integration/` — snapshot privacy (no hidden hands in public payloads),
  Zod validation. Live database/API concurrency checks (simultaneous actions,
  receipt replay, RLS membership) require a configured Supabase project and
  are exercised by the Playwright suite + manual four-browser test.
- `tests/e2e/multiplayer.spec.ts` — four browser contexts: create → join →
  ready → start → private hands → reload recovery. Skips gracefully when the
  backend is not configured.
