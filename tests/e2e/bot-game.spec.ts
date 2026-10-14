/**
 * Live bot-game probe (SPEC §10 bot-filling + reconnect_paths, gated).
 * Run with E2E_BOTS=1. Plays a REAL full hand on the phone viewport:
 * 1 human + 3 server bots, asserting the trick pile renders, the human can
 * act every turn, a hand completes with placements, and the page never
 * overflows horizontally (phone fit).
 *
 * The human strategy is deliberately dumb (lowest single that the UI
 * accepts, else pass) — bots do the rest through the same server path as
 * production.
 */
import { expect, test, type Page } from "@playwright/test";

const BOTS = process.env.E2E_BOTS === "1";
test.skip(BOTS !== true, "Set E2E_BOTS=1 to run the live bot game (needs backend + anon quota).");

const RANK_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

function rankOf(id: string): string {
  if (id === "JOKER_BLACK") return "BJ";
  if (id === "JOKER_RED") return "RJ";
  return id.slice(1);
}

function sortLowFirst(ids: string[]): string[] {
  const val = (id: string) => {
    const r = rankOf(id);
    if (r === "BJ") return 100;
    if (r === "RJ") return 101;
    return RANK_ORDER.indexOf(r);
  };
  return [...ids].sort((a, b) => val(a) - val(b) || (a < b ? -1 : 1));
}

async function handIds(page: Page): Promise<string[]> {
  return page
    .getByTestId("player-hand")
    .locator('[data-card-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-card-id")!));
}

async function noHorizontalOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow at ${where}`).toBeLessThanOrEqual(1);
}

test("one human + three bots completes a hand on a phone viewport", async ({ browser }) => {
  test.setTimeout(420_000);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("murlan.username", "ProbeHuman");
  });
  try {
    await page.goto("/");
    await noHorizontalOverflow(page, "home");
    // Enable bot fill, create room.
    await page.getByLabel(/Allow filling empty seats/).check();
    await page.getByRole("button", { name: "Create room" }).click();
    await page.waitForURL(/\/room\//, { timeout: 30_000 });
    await expect(page.getByText("Lobby")).toBeVisible({ timeout: 15_000 });
    await noHorizontalOverflow(page, "lobby");

    // Ready + start (host). Bots fill the other three seats.
    await page.getByRole("button", { name: "Ready up" }).click();
    await expect(page.getByRole("button", { name: "Not ready" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Start match" }).click();

    const hand = page.getByTestId("player-hand");
    await expect(hand).toBeVisible({ timeout: 30_000 });
    await noHorizontalOverflow(page, "table");

    let sawPile = false;
    let actions = 0;
    const latencies: number[] = [];
    const t0 = Date.now();
    // Play until the hand ends (result overlay) or we run out of budget.
    while (Date.now() - t0 < 300_000) {
      // Hand over?
      if (await page.getByRole("dialog").first().isVisible().catch(() => false)) {
        const title = await page.getByRole("dialog").first().textContent().catch(() => "");
        if (/result|wins|tied/i.test(title ?? "")) break;
      }
      // Exchange phase? Pick the first card and confirm.
      const exchangeGive = page.getByRole("button", { name: "Give card" });
      if (await exchangeGive.isVisible().catch(() => false)) {
        const ids = sortLowFirst(await handIds(page));
        if (ids.length > 0) {
          await page.getByTestId("player-hand").locator(`[data-card-id="${ids[0]}"]`).click();
          await exchangeGive.click();
          actions++;
        }
        await page.waitForTimeout(1200);
        continue;
      }
      const playBtn = page.getByRole("button", { name: "Play selected cards" });
      const passBtn = page.getByRole("button", { name: "Pass", exact: true });
      const myTurn = await page.getByText("YOUR TURN", { exact: true }).isVisible({ timeout: 2_000 }).catch(() => false);
      if (!myTurn) {
        await page.waitForTimeout(1200); // bots thinking / polling
        continue;
      }
      // My turn: make sure something is selected (fresh leads start empty).
      const selectedCount = await page
        .getByTestId("player-hand")
        .locator('[data-card-id][aria-pressed="true"]')
        .count()
        .catch(() => 0);
      const before = sortLowFirst(await handIds(page));
      if (selectedCount === 0 && before.length > 0) {
        await page.getByTestId("player-hand").locator(`[data-card-id="${before[0]}"]`).click({ position: { x: 8, y: 30 } });
      }
      const canPlay = await playBtn.isEnabled({ timeout: 3_000 }).catch(() => false);
      const canPass = await passBtn.isEnabled({ timeout: 3_000 }).catch(() => false);
      if (canPlay) {
        // Try cards low-first until Play enables (UI pre-validation decides).
        // Buried cards are mostly covered by their neighbour: force the click.
        // A bot move landing mid-tap can invalidate the pick (tap is then a
        // no-op with an explanatory message) — retry with a fresh selection.
        let played = false;
        for (let attempt = 0; attempt < 3 && !played; attempt++) {
          const clear = page.getByRole("button", { name: "Clear selection" });
          if (await clear.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await clear.click();
          }
          const current = sortLowFirst(await handIds(page));
          for (const id of current) {
            await page.getByTestId("player-hand").locator(`[data-card-id="${id}"]`).click({ position: { x: 8, y: 30 } });
            if (await playBtn.isEnabled({ timeout: 2_000 }).catch(() => false)) {
              const tClick = Date.now();
              await playBtn.click({ timeout: 10_000 });
              try {
                // Optimistic pile must appear ~instantly.
                await expect(page.getByTestId("trick-area").locator(`[data-card-id="${id}"]`)).toBeVisible({ timeout: 2_000 });
                sawPile = true;
                // Server confirmation = card leaves the hand.
                await expect
                  .poll(async () => (await handIds(page)).includes(id), { timeout: 20_000 })
                  .toBe(false);
                latencies.push(Date.now() - tClick);
                actions++;
                played = true;
              } catch {
                // Stale tap (bot moved first) — retry with fresh selection.
              }
              break;
            }
          }
          if (!played) break;
        }
        if (!played && (await passBtn.isEnabled({ timeout: 2_000 }).catch(() => false))) {
          await passBtn.click({ timeout: 10_000 });
          actions++;
        }
      } else if (canPass) {
        await passBtn.click({ timeout: 10_000 });
        actions++;
      } else {
        await page.waitForTimeout(800);
      }
      await noHorizontalOverflow(page, "table");
      await page.waitForTimeout(800);
    }

    console.log(`bot-game: actions=${actions} sawPile=${sawPile} latencies(ms)=${latencies.slice(0, 12).join(",")}`);
    expect(sawPile, "played cards never appeared in the trick area").toBe(true);
    expect(actions).toBeGreaterThan(0);
    // The hand must have completed with placements (dialog shows result).
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
  } finally {
    await ctx.close().catch(() => undefined);
  }
});
