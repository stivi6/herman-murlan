# Third-party notices

## Card artwork

Playing-card faces and the card back are vendored SVG artwork from
[`@letele/playing-cards@0.1.0`](https://github.com/letele/playing-cards)
(React SVG components converted from Adrian Kennard's classic SVG card
designs), which is dedicated to the public domain under **CC0 1.0 Universal**.
The upstream licence is preserved at `public/cards/LICENSE-CC0.txt`.

What was vendored (static `.svg` files under `public/cards/`, renamed to this
app's canonical card IDs so no runtime dependency on the package remains):

- 52 faces from `@letele/playing-cards`: `S3.svg … C2.svg` (single-letter
  suit + rank). Full text of the CC0 dedication: `public/cards/LICENSE-CC0.txt`.
- `JOKER_BLACK.svg` / `JOKER_RED.svg`: the classic full-color court jesters
  extracted as standalone files (with their dependency closure) from
  [`SVG-cards` by David Bellot / contributors, v4.0.2](https://github.com/htdebeer/SVG-cards),
  licensed **LGPL-2.1**. Full license text: `public/cards/LICENSE-LGPL-svg-cards.txt`.
  The two jokers differ as upstream (black vs red "JOKER" caption), which also
  keeps them distinguishable in-game, where Red Joker outranks Black Joker.
- `CARD_BACK.svg` (upstream `B2` lattice back from `@letele/playing-cards`).
- No npm dependency on either package; no card art loads from any URL.

If the deck is ever replaced, keep original/CC0-or-equivalent licensing,
keep the files local (never hotlink), and update this notice.

## Other open-source software

- Next.js, React, Tailwind CSS, Motion, Supabase JS/SSR, Zod, Zustand,
  Vitest, Playwright — each under its own licence (MIT/Apache-2.0); see the
  respective packages in `package.json` / `package-lock.json`.
- No proprietary game branding, logos, screenshots, or artwork from any
  existing Murlan app are used in this project.
