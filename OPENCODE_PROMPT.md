# OpenCode execution prompt — Murlan

Read `SPEC.md` completely before editing the repository. Treat it as the source of truth for features, rules, UX, security, architecture and acceptance criteria.

Build the actual working application end-to-end for a small private group of friends: Next.js + TypeScript on Vercel, Supabase Auth/Postgres/Realtime, private invite-code rooms, four players, FFA and 2v2, polished responsive card-table UI, and the exact game rules in `SPEC.md`. This is not a public matchmaking platform. Do not add ads, monetisation, ranked play, global profiles, global leaderboards or unrelated systems.

Work as a senior software engineer. Inspect the existing repo first. Then implement in dependency order, keeping the Murlan engine pure and independently tested before building UI. Use real Supabase-backed persistence and server-validated actions, not in-memory state or mocked buttons. Use a database transaction / compare-and-swap version guard plus action-ID idempotency so simultaneous clicks and retries cannot duplicate moves. Protect all private hands and keep hidden state out of public Realtime messages. Add migrations with proper RLS, `.env.example`, `README.md`, `THIRD_PARTY_NOTICES.md`, Vitest tests and Playwright multiplayer tests.

Do not ask me to choose between equivalent implementation details. Use the explicit defaults in `SPEC.md`, make secure/reasonable decisions for remaining details and document them. Never silently alter a supplied Murlan rule. Do not copy proprietary app branding or card art; use the reusable card artwork and original UI direction described in the spec.

Do not stop after scaffolding or a first visual pass. Finish the complete code paths, fix errors, run lint/typecheck/tests/build, and report exact command results. If Supabase/Vercel credentials are unavailable, still finish all code, tests, migrations and setup docs, and clearly separate what is verified locally from what requires deployment credentials. Never claim an online multiplayer flow is verified unless you actually tested it against a working backend.
