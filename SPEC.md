# Murlan — Private Multiplayer Web Game Specification

**Document purpose:** This is the implementation contract for OpenCode. Build a complete, reliable browser-based Murlan game for one small friend group. Do not turn it into a public gaming platform.

**Source of truth for rules:** The Albanian rules pasted by the project owner in the conversation. When a rule is missing or ambiguous, use the explicit fallback in this document and keep it isolated/configurable rather than silently inventing extra rules.

**Product goal:** A polished Murlan experience with the familiar landscape card-table presentation seen in existing Murlan mobile games: green felt, four player positions, readable player status, a played-card area in the centre, the player's hand along the bottom, and prominent Play / Pass actions. Implement an original interface and use legally reusable playing-card artwork; do not copy a game's proprietary logo, screenshots, or branded art.

---

## 1. Scope and non-goals

### In scope

- Private online rooms for friends, created by one player and joined by a short invite code or shareable link.
- Four seats per room, with two room modes:
  - **Classic FFA:** four individual players; use the supplied 3/2/1/0 hand scoring.
  - **2v2:** partners sit opposite each other; team score is the sum of the two teammates' individual hand points. This is a practical house-rule layer because the supplied rules do not define team scoring.
- A guest identity with a username. No email/password account flow is needed.
- Optional basic rule-legal AI seats to fill an incomplete private room, after the four-human online core works. Bot turns must use the same server rules engine and can never bypass validation.
- Waiting lobby, host controls, readiness indicators, team/seat display, start game, leave room, rematch, copy/share invite code.
- Complete playable hand and match flow using the rules below.
- Live synchronisation, reconnect/reload recovery, private player hands, server-authoritative moves, score tracking and game results.
- Responsive UI that is best in landscape but remains usable on desktop and mobile browsers.
- A local rules engine with extensive automated tests and a browser-based end-to-end test of multiple players.
- Clear loading, empty, error, disconnect and reconnect states.

### Explicitly out of scope for this friend-group version

- Public matchmaking, ranked queues, global leaderboards, global player discovery, public profiles, spectators, public match history, seasons, monetisation, ads, purchases, daily rewards, shops, cosmetics inventory, social graph, push notifications, voice chat and a general-purpose gaming platform.
- Real-money wagering or gambling mechanics.
- A native mobile app or game engine. This is a web app deployed to Vercel.
- Public global leaderboards or advanced competitive AI. Basic private-room bot filling is allowed, but it is secondary to the reliable four-human multiplayer core. Do not market the bot as expert-level.

### Done means

A deployed room can host four friends on separate browsers/devices; each sees their own private hand and the same public table; valid moves work; invalid or simultaneous moves cannot corrupt the game; refresh and short disconnects do not lose the hand; all scores and target extensions work; a completed match can be rematched; tests pass; and setup/deployment instructions are written.

---

## 2. Technology choices

Use the latest stable versions that work together at implementation time. Pin package versions through the package manager lockfile; do not install unnecessary dependencies.

- **Framework:** Next.js App Router + React + TypeScript, deployed on Vercel.
- **Styling:** Tailwind CSS. Use shadcn/ui selectively for dialogs, tooltips, inputs and accessible primitives. The main game table should be custom React/CSS, not a generic dashboard layout.
- **Animation:** Motion (`motion/react`) or CSS transitions where enough. Keep animations short and respect `prefers-reduced-motion`.
- **Backend/database:** Supabase Postgres, Supabase Auth anonymous sign-in, Supabase Realtime. Use `@supabase/ssr` for server/browser session integration.
- **Validation:** Zod for API payloads and environment configuration.
- **Client-only view state:** Zustand only if React state becomes unwieldy. Do not mirror authoritative game state as an independently editable client store.
- **Tests:** Vitest for rules/unit/integration tests; Playwright for end-to-end browser tests. Use at least four browser contexts in a multiplayer E2E test.
- **Card faces:** Prefer the CC0 SVG playing-card assets in `@letele/playing-cards` or their corresponding source assets. Check the package works with the selected toolchain before adopting it. Bundle the assets locally; never depend on a third-party image URL at runtime. Preserve the licence notice in the repository and add a `THIRD_PARTY_NOTICES.md`.
- **No game engine:** No Unity, Unreal, Godot, Canvas game framework or WebGL is needed. The gameplay is a turn-based card table and should be normal React/SVG/CSS.

### Required repository-level behaviour

- TypeScript strict mode enabled.
- Lint, typecheck, unit tests and production build must pass before declaring a milestone complete.
- Never hide TypeScript errors with `any`, `@ts-ignore`, disabled lint rules or broad casts merely to make the build pass.
- Keep the rules engine independent of React, Next.js, Supabase and browser APIs so that it can be tested in isolation.
- Do not put secrets in client code, `NEXT_PUBLIC_*` variables or committed files.

---

## 3. Visual direction and UX

### Design target

Build a recognisable, polished card game—not a management dashboard. Use the current Murlan mobile game visual conventions as inspiration: landscape composition, a green-felt oval/rounded table, a slim gold or warm-yellow trim, four player stations around the table, a centre trick area and a hand of full-size cards anchored at the bottom. Use original interface treatment and the selected open-source card art rather than copying proprietary branding.

### Responsive layout

- **Desktop / landscape:** table fills most of the viewport; bottom player hand is always reachable; player stations occupy bottom, left, top and right; centre displays the current combination and a compact recent-play history.
- **Mobile landscape:** maximise playable table area, overlap hand cards carefully and show clear selected states. Keep Play and Pass controls comfortably tappable.
- **Mobile portrait:** provide a usable layout or a clear “rotate for best experience” banner without blocking the game. Do not force a browser orientation lock (it is not consistently supported).
- Cards must remain recognisable at the minimum supported width. On very small screens, allow horizontal hand scrolling or card overlap with tap-to-focus; never make cards impossible to select.

### Core screen inventory

1. **Home:** title/logo, username field or editable username chip, Create Room, Join Room, how-to-play/rules entry, settings for sound and motion.
2. **Create Room:** choose FFA or 2v2, create room, show generated code/link. No account creation page.
3. **Join Room:** code input, paste support, validation, helpful not-found/full/expired messages.
4. **Lobby:** room code with Copy and Share, four seats, username/avatar colour, ready toggle, connection status, host marker, FFA/2v2 mode, team pairing in 2v2, chat optional and small (not required for first release), leave room, host start button. Start is disabled until four seats will be occupied: either four distinct ready humans, or at least one ready human plus the host-enabled “Fill empty seats with bots” option. Human players must all be ready.
5. **Game table:** four seats, avatars or initials, remaining-card count, score, team label in 2v2, active-turn glow/indicator, last played combo, player's hand, Play, Pass, Sort, selected-card feedback, move/turn feedback, toast/errors and reconnect indicator.
6. **Hand result overlay:** 1st/2nd/3rd/4th placement, individual points, team totals in 2v2, updated cumulative scores, target threshold, card-exchange instructions if another hand is needed.
7. **Match result:** winner or tied result according to the tiebreak rules, final scores, Play Again / Return to Lobby.
8. **Rules drawer/modal:** concise explanation of rankings, combinations, passing, first play, card exchange, scoring and the 2v2 house rule.

### Game-table behaviour

- Display the current played cards face-up in the centre, in a readable fan/row. A previous play may remain in a small history area, but the active trick must be visually obvious.
- Each opponent station displays username, number of cards remaining, score and whose turn it is. Opponent hands are never shown face-up.
- Bottom seat is always the current browser's player. Seat rotation on screen is a presentation transform only; never alter canonical seat/player order in game logic.
- Selected cards rise slightly or receive a clear outline. Sort options: rank ascending/descending and group by rank. Sorting changes only the local display order, never server game state.
- Play button is disabled until the selected cards form a valid move for the current state. Server validation remains authoritative even if the UI pre-validates.
- Pass button is always visible when it's the player's turn. If a pass is not currently legal due to the game's rule state, do not send it; show the reason.
- Show clear messages for “not your turn”, “invalid combination”, “you must include 3♠”, “another move was accepted first”, “reconnecting” and “the room is full”. Avoid generic silent failures.
- Animations must never block actions for more than a short transition. If network state updates mid-animation, reconcile to the authoritative state.
- Sound effects are optional and off by default. No audio should auto-play before a user gesture.

### Visual quality details

- Strong hierarchy and readable typography; consistent spacing; restrained shadows; high contrast between card faces and felt.
- Do not use emoji as card art.
- Card positions and animations must be keyed by stable card ID, not array index.
- Include loading skeletons, empty/error states, accessible focus states, `aria-label`s for card controls and keyboard support (Space/Enter to select; accessible Play/Pass buttons; Escape closes overlays).
- Respect reduced motion. Avoid layout shift as cards are played or a result overlay opens.

---

## 4. Murlan rules engine — authoritative specification

Implement as a pure TypeScript module, e.g. `src/lib/game/`. The engine takes an immutable game state and an action, returns either a validated transition or a structured rule error. It must not read from the database, React state, system time or `Math.random` internally. Random dealing is a separate server-only function.

### 4.1 Deck and card model

- Use a standard 52-card deck plus two distinct jokers: **Black Joker** and **Red Joker** (54 cards total).
- Four suits: spades, hearts, diamonds, clubs. Each has 3–10, Jack (Fant/Jan), Queen (Çupë), King (Mbret), Ace and 2. No duplicate physical card IDs.
- Use stable card IDs such as `S3`, `H10`, `CJ`, `DA`, `C2`, `JOKER_BLACK`, `JOKER_RED`.
- Canonical single-card order, lowest to highest: `3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2, Black Joker, Red Joker`.
- Suits do not affect card strength. The 3 of spades is special only for the first play of the first hand.
- Store cards in structured form (`id`, `rank`, `suit`, `isJoker`) rather than parsing labels throughout the code.

### 4.2 Dealing

- Shuffle all 54 cards using server-side unbiased Fisher–Yates with cryptographically secure randomness (`node:crypto` or equivalent). Never use `Math.random()` for the authoritative shuffle.
- Deal all cards to four players; no cards are discarded. Two players receive 14 cards and two receive 13.
- The source rules do not specify which seats receive the two extra cards. Implementation default: choose a random starting seat for round-robin dealing each hand; deal clockwise. This gives all seats a fair chance of receiving the extra cards over repeated hands.
- Never transmit the full deck order or all hands to a client.
- The first hand's opening player is whoever holds `S3`; all players are dealt before that player is determined.

### 4.3 First move of the match

- On the first hand of a match only, the player holding `S3` must open the first trick with a legal combination containing `S3`.
- The opening may be a single, pair, triple, four-of-a-kind or scale if—and only if—the selected cards form a legal combination and include `S3`.
- No one may play before that opening action. Once the opening play is accepted, normal rules apply.
- If a client attempts a first play without `S3`, reject it server-side with a specific error. The UI must explain the requirement.
- Later hands do not have this forced-card rule.

### 4.4 Legal combinations

Exactly these combination types are supported:

1. **Single:** one card.
2. **Pair:** two cards of the same rank. The two suits may differ.
3. **Triple:** three cards of the same rank.
4. **Four-of-a-kind (bomb):** four cards of the same rank. This is a special combination that beats any non-bomb combination.
5. **Scale / straight:** at least five cards of consecutive permitted sequence ranks, any suits. Suits do not have to match; do not require flushes.

Rules for scales:

- Normal order is `3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A`.
- A scale may end at Ace, and a sequence ending at Ace is the highest ordinary scale of its length (for example `10, J, Q, K, A`).
- Ace may also be low only in the specific sequence `A, 2, 3, 4, 5`.
- `2` is not allowed in any other scale; jokers are never allowed in scales; no wrap-around sequences are allowed.
- There can be no repeated rank inside a scale.
- Scales of different lengths do not beat each other. A response scale must have exactly the same card count and a strictly higher top/end rank in the permitted sequence. This interprets the source example as “at least one rank higher,” not “exactly the next rank only.”
- For comparison, treat `A,2,3,4,5` as a low scale ending at `5` for strength purposes. A normal scale ending in Ace is the highest scale of the same length.

Combination classification must be deterministic and unit-tested. If a selected card set could theoretically match more than one classification, use this precedence: four-of-a-kind, scale, triple, pair, single. A valid set of five or more consecutive ranks is always a scale, not a different type.

### 4.5 Beating the current play

- If the table is open, the current leader may play any legal combination, subject to the first-hand `S3` rule.
- A normal response must be the same combination type and same number of cards, and must be strictly stronger than the current play.
- Singles compare by card rank.
- Pairs and triples compare by their common rank.
- Scales compare by length first (must be equal), then by the sequence top rank as defined above.
- Four-of-a-kind beats every non-bomb combination, regardless of the non-bomb's size or rank.
- A bomb can only be beaten by a higher four-of-a-kind. For bomb-vs-bomb comparison, compare the rank using the canonical rank order (`3` up to `2`); the higher rank wins.
- There are only four physical suits of each normal rank; jokers are not a rank that can form four-of-a-kind.
- Once a bomb is played, the active trick's combination is that bomb; the next successful response must be a higher bomb.
- A weaker, equal or otherwise incompatible play is rejected by the server. Equal rank is not a beat.

### 4.6 Turns and passing

- Turns proceed clockwise through players who have not finished the hand.
- A bot seat, when enabled, chooses a move using a deterministic rules-based heuristic and the same legal-action generator as humans. The bot receives only its own hand and public table state; do not expose opponents’ hidden hands to the bot policy. It must never mutate state directly or bypass the normal server transition validation. On a bot turn, the server submits a bot action through the same transition path.
- A player may pass instead of playing. Passing does not remove cards from their hand.
- Default rule interpretation: once a player passes on the current trick, that player remains passed for that trick and cannot re-enter until the trick resets. This matches the “all pass, start again from the last successful player” flow and is isolated in one rules-engine function in case the owner later confirms a different local variant.
- When every other still-active player has passed, the trick ends. The last player who successfully played cards leads a new trick with any legal combination.
- When the trick resets, clear pass markers for all players still active in the hand. Finished players never re-enter.
- Track the last successful player independently from the player whose turn comes next; these are not always the same.
- A pass action must be accepted at most once for a player's current turn/version. Clients may retry the same action ID after a network timeout without causing a second move.

### 4.7 Finishing a hand

- A player finishes their placement immediately when their successful play leaves them with zero cards.
- Record placements in order of finish: first place, second, third. When three players have finished, the sole remaining player is fourth place and the hand ends immediately.
- A finished player cannot be selected as the next actor, receive a turn, pass, play or rejoin the trick.
- If a player's final play is later beaten, that player remains finished; beating their last play does not put cards back in their hand.
- If the last successful player has finished, a trick reset must be led by the next still-active player clockwise, not the finished player.
- End-of-hand resolution must be deterministic even if a play both finishes a player and also closes the hand.

### 4.8 Hand exchange and next-hand leader

These rules apply after every completed hand **only if the overall match has not ended**:

- Normally, the previous hand's first-place player exchanges one card with the previous hand's fourth-place player.
- The fourth-place player gives their single highest-ranked card, using the canonical order. Because rank order is total, there is no tie for highest physical card rank except no duplicates at the top beyond normal ranks; if multiple equal-rank cards exist, choose deterministically by suit order solely for exchange selection.
- The first-place player chooses a card whose rank is between `3` and `10` inclusive to give back. Suits do not affect this restriction.
- If the first-place player has no cards ranked 3–10, fallback: they may give any one card. Display a short rule note in the exchange UI so this exception is not mysterious.
- Exception: if the fourth-place player holds **both Jokers** at the end of the deal/hand before exchange, no cards are exchanged.
- Normally, the next hand is opened by the previous hand's fourth-place player. Exception: if that player held both Jokers and the exchange is skipped, the previous hand's first-place player opens the next hand.
- The new hand must be dealt and exchange resolved on the server; clients cannot select which card the last-place player gives.
- Show the first-place player which card they received and let them select the return card. Until exchange is resolved, the next hand cannot start.
- On a new hand, shuffle and redeal all 54 cards. Do not retain old hands or leftover cards.

### 4.9 Scoring and match end

**Classic FFA:** after each hand, award exactly: first place = 3 points, second = 2, third = 1, fourth = 0. Add to the player's cumulative match score.

**Target extension:** initial target is 21. After a completed hand's points are applied:

- If exactly one player has score `>= currentTarget`, that player wins the match.
- If two or more players have score `>= currentTarget`, increase target by 10 using the sequence `21 → 31 → 41 → 51`, and continue.
- Never set a target above 51.
- At target 51, the supplied rules do not specify what happens if multiple players are already at or above 51. Explicit fallback: among those at/above 51, the highest cumulative score wins; if the highest score is tied, the match is a tie. Show a tie result rather than inventing another target.
- Do not exchange cards or deal a new hand once a match winner/tie has been determined.

**2v2 house rule:** each teammate keeps an individual placement score for the hand; each team receives the sum of both teammates' hand points. The target applies to team totals. If only one team is at/above the current target, that team wins. If both teams are at/above the target, target increases by 10 to the cap of 51. At the 51 cap, the higher team total wins; if equal, match is tied. Display both team and player totals. Card dealing, combination, turn, exchange and hand-placement rules remain unchanged from Classic unless specified above.

### 4.10 Explicitly not part of the rules

- Do not add suit hierarchy.
- Do not allow flushes, joker wildcards, joker scales, 2-high scales, wrap-around scales, or mixed-card-count responses (except the bomb rule).
- Do not implement a “take the loser's best card” rule; it is not in the owner's pasted source rules. The only exchange is the specified first-place/fourth-place exchange.
- Do not add random special powers, betting, chips, money, or casino mechanics.

---

## 5. Domain models and state invariants

Use clear types for `Card`, `Player`, `Room`, `Match`, `Hand`, `Trick`, `Play`, `Action`, and `Score`. Avoid a giant untyped JSON object accessed through string keys. Persist a versioned state schema and validate it when loading.

### Suggested authoritative state

The server-only match state should include:

- schema version;
- match ID, room ID, current hand number and game status (`lobby`, `dealing`, `playing`, `exchange`, `handResult`, `finished`, `cancelled`);
- room mode (`ffa` or `2v2`), current target and cumulative points;
- canonical seat order and authenticated user IDs for the four seats;
- server-generated shuffled deck during dealing only; all four private hands; cards played/discarded this hand;
- first-hand flag and required opening card flag;
- current actor, last successful player, current combination and played card IDs;
- passed seats for current trick; players' finishing positions; next-hand leader;
- current state version and timestamps for audit/recovery;
- action-id receipts or enough data to deduplicate retries.

The public snapshot may contain only:

- room/match ID, state version and status;
- seat display names, avatar colour/initials, team, connection status and remaining-card count;
- public scores and target;
- current actor and turn indicator;
- face-up current play and public move history for this hand;
- pass/finished statuses that are already public;
- placement/results/exchange phase messages;
- no private card IDs, hidden deck order, salts/seeds, auth/session tokens or private user data.

The authenticated `GET` snapshot response adds only the requesting player's own cards and their own permitted UI flags. Do not send the other three hands to the client, even hidden in JSON, React props, HTML, logs or realtime payloads.

### State invariants (assert in the rules engine and tests)

- Every physical card ID exists at most once across the deck, hands, played cards and exchange state.
- Every card is in exactly one valid location during an active hand.
- The deck + all hands + played/discarded cards account for exactly 54 cards after dealing, with no lost or duplicated cards.
- Exactly four seats are occupied to start a match; each user occupies at most one seat in a room.
- Only a member of the room can read its public state or submit a game action; only a player can act for their own seat.
- Only the current actor may play or pass; action is validated against the current state version.
- Current actor always references a player who is not finished and is not already passed for the active trick.
- Finished placements are unique and ordered. A player cannot finish twice.
- Scores only increase and are changed only by the server at hand end.
- Target can only be 21, 31, 41 or 51.
- A match's terminal status cannot revert to playing without creating a new match/rematch.
- Never allow a client to provide authoritative scores, placements, target, deck, opponent hands or current actor.

---

## 6. Online architecture and database

### Architecture

- Next.js Route Handlers are the command/API boundary and run on the Node.js runtime where the selected crypto/database libraries are supported. Do not run game actions as Edge Functions unless all dependencies and locking semantics are confirmed.
- Supabase Auth anonymous identities authenticate a browser session. Display names are room-level values, not a global public profile.
- The browser submits **intent** (`play selected cards`, `pass`, `ready`, `start`, `select exchange card`) rather than a full replacement state.
- The server derives user identity from the verified Supabase session, checks room membership and seat ownership, loads private state, validates the action with the pure rules engine, then commits it atomically.
- Use Supabase Realtime only to notify room members about a new **public** state version/snapshot. After notification, each client fetches its own authorized snapshot so it receives its private hand separately. Realtime must never broadcast the private game state.
- Clients may predict animation timing, but they must reconcile to server state after every accepted action.

### Tables (names may be adjusted, security properties may not)

1. `rooms`
   - `id`, `code_hash` or safely stored short code, `host_user_id`, `mode`, `status`, `created_at`, `expires_at`, `current_match_id`, `settings`.
   - Room codes are random, non-sequential and use an unambiguous alphabet (avoid `0/O` and `1/I`). Six to eight characters is suitable.
   - Enforce unique codes and retry on collision.
2. `room_members`
   - `room_id`, `user_id`, `seat_index` (0–3), `display_name`, `ready`, `team_id`, `joined_at`, `last_seen_at`, `presence_status`, `is_host`.
   - Unique `(room_id, user_id)` and unique `(room_id, seat_index)` for occupied seats.
   - Username uniqueness is case-insensitive within a room. Validate length and strip/reject control characters.
3. `game_sessions` (server-only)
   - `id`, `room_id`, `schema_version`, `version`, `status`, `private_state` (JSONB), `created_at`, `updated_at`.
   - Never allow direct browser SELECT/INSERT/UPDATE/DELETE. Deny all client roles with RLS; only trusted server/database functions may access full state.
4. `match_public_snapshots`
   - `match_id`/`room_id`, `version`, `snapshot` (JSONB), `updated_at`.
   - Contains public information only. Enable SELECT only for authenticated users who are current members of that room; no client writes. Include this table in Realtime only if RLS and membership filters are correctly applied.
5. `game_action_receipts` or equivalent atomic idempotency table
   - Unique `(match_id, actor_user_id, action_id)`, accepted/rejected result, resulting version and safe public response. Do not store secrets in the response.
6. `game_events` (optional but recommended)
   - Append-only public action events for debugging/hand review. Store only public moves and state version, never hands or shuffled deck. Keep retention modest for this private app.

Create versioned SQL migrations. Add explicit indexes for room code, room membership, room/match status and action idempotency. Avoid dynamic SQL built from client input.

### Atomic move protocol (mandatory)

Concurrency bugs are a major risk when two players click at once or a mobile client retries a request. Use an optimistic state-version protocol backed by an atomic database compare-and-swap transaction:

1. Client creates a UUID `actionId` for a user intent and sends `{ actionId, expectedVersion, action }`.
2. API verifies session, room membership and seat ownership from the server session—not from a client-provided `userId`.
3. If `actionId` was already accepted, return its original receipt without applying the action again.
4. Read current private state and run the pure transition function. Invalid actions produce a structured error and do not mutate state.
5. A server-only SQL RPC/function locks or compare-and-swaps the state version and, in a single database transaction, commits the new private state, new public snapshot, incremented version, action receipt and event record. If the expected version is stale, commit none of these changes and return a `STALE_STATE` result.
6. On `STALE_STATE`, client fetches the latest authorised snapshot, explains that another move was accepted first, clears any invalid optimistic selection and lets the player choose again. Never automatically replay a stale play against a different state.
7. Reusing the same `actionId` after network timeout must never apply the play twice. A genuinely new attempt uses a new ID.

Do not rely on “read state, then ordinary update” without a row lock or conditional version check. Do not store authoritative state in a module-level variable; Vercel functions are stateless and requests may run in different instances.

### API surface

Use route names consistent with Next.js App Router, for example:

- `POST /api/rooms` — create a private room.
- `POST /api/rooms/join` — join by code and assign a free seat.
- `GET /api/rooms/[roomId]` — get lobby/public room data if member.
- `POST /api/rooms/[roomId]/ready` — update own ready state.
- `POST /api/rooms/[roomId]/start` — host starts a match once all seats are filled and ready.
- `POST /api/rooms/[roomId]/leave` — leave lobby; in active match mark disconnected and preserve seat rather than silently deleting it.
- `GET /api/matches/[matchId]/snapshot` — public state plus requesting player's own private hand.
- `POST /api/matches/[matchId]/actions` — play, pass or exchange choice.
- `POST /api/rooms/[roomId]/rematch` — host creates a fresh match using the room's current human players and the room's bot-fill setting.
- `POST /api/rooms/[roomId]/heartbeat` — maintain connection/last-seen status with reasonable rate limiting.

Exact route shape can change, but each operation must validate input using Zod, authenticate, authorize, and return predictable JSON error codes. Never return stack traces, service credentials, SQL text or hidden game data to a client.

### Lobby/room behaviour

- Only the room creator is host initially. Host can change mode, enable/disable bot filling, remove a player while in the lobby, and start a match.
- Normal start requires four distinct human players, all marked ready. If the host explicitly enables “Fill empty seats with bots”, one or more bot seats may fill the remaining places; at least one human must be present and all joined humans must be ready. No hidden auto-start.
- In 2v2, canonical seat 0 partners with seat 2; seat 1 partners with seat 3. The current browser is always rendered at the bottom through a visual seat rotation.
- A code collision retries; joining a nonexistent, expired, or full room gives a friendly message.
- Normalize codes to uppercase and remove spaces/hyphens at input. Rate limit repeated join attempts to protect a private room from guessing.
- A room invite link should open the join screen with the code prefilled; a code is a secret capability, so do not place it in public logs or analytics.
- Lobby can expire when empty or unused for a configured period (for example 24 hours). Do not delete a room with an active match solely because a participant refreshes.
- The room creator can leave. If the host leaves the lobby, transfer host to the earliest remaining member. During an active match, preserve the host/seat and permit reconnection; if the host leaves permanently, another connected player may receive host controls without changing the game state.

---

## 7. Disconnects, refreshes and failure recovery

- Persist the match and current version in Postgres; a browser reload must not restart or reshuffle a match.
- Persist the guest Supabase auth session in secure browser storage/cookies via the supported Supabase SSR setup. A reconnecting player with the same session resumes the same room seat.
- Use Realtime presence or heartbeats to show online/reconnecting/offline status, but do not immediately remove a seat when a tab goes into the background. Background tabs and mobile browsers may suspend activity.
- Keep a disconnected player's seat reserved during a match. Show an offline label and keep the turn state intact. Default behaviour: wait for reconnection; do not silently auto-pass or play for a disconnected user. Give the host explicit controls to wait or end/cancel the match. This protects the owner-supplied rules from invisible timeout behaviour.
- No turn timer in the first release. If later added, it must be an explicit room setting and its auto-pass policy must be shown before the match starts.
- On network reconnect, resubscribe to Realtime, fetch a fresh authorized snapshot, discard obsolete local pending selections and resume from server version.
- If Realtime disconnects, fall back to low-frequency polling while the room/game screen is active, then return to Realtime when possible. Stop polling when unmounted/backgrounded and use exponential backoff with a cap.
- If an API call times out, show pending state and retry using the same action ID; never generate a new action ID for the same uncertain request.
- If a database commit fails, keep the old version, do not publish a success animation, and let the player retry. If public snapshot/event persistence is part of the transition, these writes must be in the same transaction.
- If a room has an invalid/corrupt persisted schema, fail closed, log a redacted diagnostic on the server, and show a recoverable error rather than attempting to invent card positions.
- Avoid stale closures: every action should be based on the currently rendered server version and the latest selected card IDs.

---

## 8. Security and abuse prevention for a private friend room

This is not a public platform, but security still matters because a room URL can be shared.

- Enable RLS on all exposed Supabase tables. Deny direct access to full/private game state. Public snapshot reads require authenticated room membership. Server service-role keys are server-only and never sent to the browser.
- Derive player identity from the validated Supabase auth session. Ignore or reject client-supplied user IDs, seat indices, scores, rank results and other authority-bearing fields.
- Server validates every action and every transition; UI validation is only convenience.
- Prevent one user from joining the same room twice or occupying multiple seats. Enforce database uniqueness, not just frontend checks.
- Validate room codes, usernames, modes, card IDs and action shapes. Use a maximum username length of 18 characters as a default; reject control characters and HTML injection. Render text as text, never raw HTML.
- Rate limit room creation, joining attempts, heartbeat traffic and invalid game actions per authenticated user/IP where feasible on Vercel. Use a lightweight strategy compatible with the chosen deployment; document any limits if no external rate-limit service is added.
- Do not expose private hands in logs, Postgres Realtime payloads, analytics, error reports or public event history.
- No third-party analytics are required. Avoid collecting more personal data than the room needs.
- Require host authorisation for host operations. Being able to guess a room ID does not grant permission.
- Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` public as intended; keep service-role keys and any server signing secret out of `NEXT_PUBLIC_*` variables.
- Do not add XSS-prone chat HTML. If lightweight text chat is implemented, validate and render plain text with length/rate limits; chat is optional and should not delay gameplay.

---

## 9. Configuration and local/deployed setup

Provide `.env.example` with placeholders only, at minimum:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or current publishable-key name supported by the selected Supabase project)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- Any explicitly required app base URL or rate-limit secret, if implemented.

Do not write real credentials into the repo. Document:

1. Install dependencies.
2. Create a Supabase project.
3. Configure anonymous sign-in.
4. Run SQL migrations and confirm RLS policies.
5. Configure local environment variables.
6. Run development server and test with four browser sessions.
7. Deploy the repository to Vercel and add server/environment variables.
8. Confirm the production site only exposes public snapshots.

Use the Vercel Node.js runtime for server game routes. Ensure the app can be built with no credentials present only if the codebase supports graceful development-time missing-config errors; production gameplay must fail with a clear configuration message, not silently run a local-only fake game.

---

## 10. Testing requirements

Do not consider “the app renders” sufficient. The rules engine is the highest-risk subsystem and needs independent tests.

### Unit tests for cards and combinations

- Canonical card order, including `A < 2 < Black Joker < Red Joker` for singles.
- Single/pair/triple/four-of-a-kind classification.
- Pair/triple cards must share rank.
- Valid scales across suits; 5-card minimum; no repeated rank; normal `3 ... A`; special low `A,2,3,4,5`.
- Reject scales containing jokers, `2` anywhere except the exact low-Ace sequence, wrapped sequences, gaps, duplicates and same-rank cards.
- Compare scales only when their lengths match. A higher top rank wins; equal top rank does not beat.
- Four-of-a-kind beats a single, pair, triple and scale; a lower/equal bomb does not beat a higher bomb; a higher bomb does.
- Deterministic special-card ordering and stable tie-breaking for selecting a highest exchange card.

### Hand/match transition tests

- Every card is dealt exactly once; hand sizes total 54 with two 14-card hands and two 13-card hands.
- The opening player is the holder of 3♠; first action must contain 3♠ in a valid combination.
- Later hands have no forced 3♠ rule.
- Turn order skips finished and passed seats as required.
- Passing every eligible opponent resets to the last successful player; pass markers clear only on a reset.
- A player going out is permanently finished, even if their final play is later beaten.
- The hand ends when three players have finished; the last remaining player is fourth.
- Placements produce exactly 3/2/1/0 points.
- Target transitions 21→31→41→51 happen only when multiple players/entities are at or above the current target.
- Single winner and cap-51 tie/high-score fallback work.
- First/fourth exchange restrictions; no-swap if fourth holds both jokers; first-place fallback when they have no 3–10 cards; next-hand leader exceptions.
- 2v2 placement points sum correctly into team totals.
- A full match can finish without an unnecessary extra exchange or deal.

### Property/invariant tests

Run randomized legal/illegal action sequences and assert:

- no duplicate/lost cards;
- no negative card count;
- no finished player acts;
- only current actor moves;
- cumulative scores never decrease;
- versions strictly increase only on accepted committed transitions;
- invalid move leaves state unchanged;
- all actions are deterministic for a given state/action except server-dealing randomness.

### API/database integration tests

- A user outside a room cannot fetch snapshot, read private hands, subscribe to private room data, or act.
- A player cannot play for another seat by altering the request payload.
- Two simultaneous actions at one version result in at most one accepted transition.
- Replaying the same `actionId` does not apply the action twice.
- Stale action returns a controlled conflict and the latest snapshot remains valid.
- Failed transaction changes neither authoritative state nor public snapshot/event record.
- The public snapshot and Realtime events contain no hidden hands/deck.
- Room code collision, room full, duplicate username, duplicate user, host-only actions and expired-room cases work.

### End-to-end tests

Use four separate browser contexts/users:

1. Create an FFA room, join all four, ready up, start, verify all clients see the same public version and only their own hand.
2. Play a complete hand using test helpers/controlled fixtures, verify placements and 3/2/1/0 scoring.
3. Verify first move contains 3♠, including rejection of an invalid attempted play.
4. Verify a stronger combination, passing, bomb interruption and trick reset.
5. Run a 2v2 lobby, verify opposite-seat teams and team scoring.
6. Enable bot filling with two or three humans; verify bot seats fill only after host consent, take legal turns, and never expose opponent hands.
7. Reload one browser mid-game and verify the same user resumes the same seat/hand.
8. Simulate a disconnect and reconnection; ensure no automatic pass or state loss.
9. Double-submit an action / create a stale concurrent action and confirm only one accepted move.
10. Complete a match, verify result screen, rematch and return to lobby.

Use test-only fixtures or seeded test helpers only in tests. Never add a production endpoint that allows players to choose their hand or bypass validation.

### Required quality gates

Before completion, run and report the real results of:

- lint;
- TypeScript typecheck;
- all unit/integration tests;
- Playwright tests that can run in the available environment;
- production build.

Do not say a check passed if it was not run. List environmental checks that require credentials or a deployed Supabase instance separately.

---

## 11. Acceptance checklist

The implementation is acceptable only when all are true:

- [ ] A new user can enter a username and create a private room without account registration.
- [ ] Friends can join by code/share link from separate browsers/devices.
- [ ] The lobby supports four seats, FFA/2v2 selection, and explicit optional bot filling; start rules are enforced server-side.
- [ ] In-game UI is polished, readable and recognisably a landscape Murlan card table, with full card faces and a usable bottom hand.
- [ ] Card order, legal combinations, scales, bombs, passes, first 3♠ move, card exchange, exceptions, scoring and target extensions match this spec.
- [ ] 2v2 seats opposite partners and uses the documented team-scoring house rule.
- [ ] Optional bots fill open private-room seats only with host consent and only make server-validated legal moves.
- [ ] No player can see another player's private cards through UI, HTML, network response, database access or Realtime.
- [ ] The server—not the client—decides which move is legal and when the game changes state.
- [ ] Simultaneous requests, stale state, double clicks and request retries cannot duplicate a move or corrupt a hand.
- [ ] Refresh/reconnect resumes the current match without redealing or losing accepted actions.
- [ ] A disconnected player does not silently auto-pass under the default configuration.
- [ ] Lobby and gameplay errors have clear feedback; no silent dead buttons or fake-success animations.
- [ ] There are no public matchmaking, ads, shop, ranked, monetisation or global-profile systems.
- [ ] `.env.example`, SQL migrations, README setup/deploy steps, card-art notices and automated tests are committed.
- [ ] Lint, typecheck, tests and production build are run; any remaining blocker is explicitly reported.

---

## 12. Suggested code organisation

Adjust as needed, but preserve clear separation of responsibilities:

```text
src/
  app/
    page.tsx                         # home
    room/[roomId]/page.tsx           # lobby/game route
    api/rooms/                       # create/join/lobby/ready/start/leave/rematch
    api/matches/[matchId]/            # snapshot/actions
  components/
    home/
    lobby/
    game-table/
      GameTable.tsx
      PlayerSeat.tsx
      CardView.tsx
      PlayerHand.tsx
      TrickArea.tsx
      GameActions.tsx
      ScorePanel.tsx
      HandResultOverlay.tsx
    ui/
  lib/
    game/
      cards.ts
      deck.ts
      combinations.ts
      compare.ts
      transitions.ts
      scoring.ts
      exchange.ts
      state.ts
      errors.ts
      fixtures.ts                  # test-only fixtures must never affect production
    supabase/
      browser.ts
      server.ts
      admin.server.ts               # service role; server-only import guard
    api/
      auth.ts
      validation.ts
      errors.ts
      rate-limit.ts
    schemas/
      actions.ts
      room.ts
  hooks/
  styles/
supabase/
  migrations/
tests/
  unit/
  integration/
  e2e/
THIRD_PARTY_NOTICES.md
.env.example
README.md
SPEC.md
```

Never import the service-role client from a client component. Add a `server-only` guard around admin clients where supported.

---

## 13. Instructions to OpenCode

1. Inspect the repository first. If an existing app is present, preserve useful code and report the starting stack; do not overwrite blindly. If empty, scaffold the project according to this spec.
2. Treat this file as the main product and engineering contract. Do not add unrequested public-platform features.
3. Implement in dependency order: foundations/configuration → pure rules engine + exhaustive tests → database migrations/security → room API → real table/lobby UI → realtime/reconnect → Playwright tests → deployment documentation.
4. Do not create a fake frontend with hard-coded sample players and declare it complete. Any demo mode must be visibly labelled and separated from real rooms.
5. Keep rules decisions in the pure engine. Components should render state and dispatch actions, not reimplement rules in multiple places.
6. After each major step, run the relevant tests and fix regressions before proceeding. Do not leave `TODO`, placeholder buttons, fake APIs or mocked success paths in the production user flow.
7. When the spec leaves an implementation detail open, prefer the simplest secure solution consistent with these requirements. Document the decision in `README.md`; do not silently change the supplied game rules.
8. If a platform limitation or missing external credential prevents full verification, finish all code and local tests possible, then clearly identify only the remaining external setup steps. Never claim end-to-end online play is verified without actually exercising it.
9. Final response must summarise files built, exact tests run and results, Supabase/Vercel setup still required, known unresolved issues, and the commands to run locally. Do not report success for anything not verified.

---

## 14. Reference links

These are for feature and visual reference only, not to copy proprietary branding or assets:

- Murlan Cards Play Store listing: https://play.google.com/store/apps/details?id=app.murlan.mobile
- MURLAN / TRIV.AL Play Store listing: https://play.google.com/store/apps/details?id=games.trival.murlan
- Murlan Cards screenshot/feature reference: https://www.murlan.app/
- CC0 React SVG playing cards: https://github.com/letele/playing-cards
- Supabase Realtime with Next.js: https://supabase.com/docs/guides/realtime/realtime-with-nextjs
- Supabase Auth SSR guidance: https://supabase.com/docs/guides/auth/server-side/nextjs

The owner's pasted Albanian rules take precedence over any differences seen in online game descriptions or screenshots.
