/**
 * Redesign verification shots (gated: E2E_SHOTS=1, needs backend + quota).
 * Drives a REAL bot match on the production server and captures the table at
 * six viewports: fresh/full-hand, your-turn, pile, keyboard-focus, plus a
 * reduced-motion render. Saves PNGs under test-results/redesign/.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = process.env.E2E_SHOTS === "1";
test.skip(SHOTS !== true, "Set E2E_SHOTS=1 to capture redesign screenshots.");

const OUT = "test-results/redesign";

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, mobile: false },
  { name: "1280x720", width: 1280, height: 720, mobile: false },
  { name: "768x1024", width: 768, height: 1024, mobile: false },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "360x800", width: 360, height: 800, mobile: true },
  { name: "844x390", width: 844, height: 390, mobile: true },
];

async function handIds(page: Page): Promise<string[]> {
  return page
    .getByTestId("player-hand")
    .locator("[data-card-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-card-id")!));
}

test("capture redesign screenshots", async ({ browser }) => {
  test.setTimeout(1_200_000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];

  for (const vp of VIEWPORTS) {
    const tVp = Date.now();
    const log = (m: string) => console.log(`[${vp.name} +${Math.round((Date.now() - tVp) / 1000)}s] ${m}`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await ctx.newPage();
    await page.addInitScript((u: string) => localStorage.setItem("murlan.username", u), `Shot${vp.name.replace("x", "")}`);
    try {
      page.on("pageerror", (e) => errors.push(`${vp.name}: ${String(e).slice(0, 160)}`));
      await page.goto("/");
      await page.getByLabel(/Allow filling empty seats/).check();
      await page.getByRole("button", { name: "Create room" }).click();
      await page.waitForURL(/\/room\//, { timeout: 30_000 });
      await page.getByRole("button", { name: "Ready up" }).click();
      await page.getByRole("button", { name: "Start match" }).click();
      await expect(page.getByTestId("player-hand")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1200);
      log("table ready");

      // 1) Fresh table, full hands in the fans.
      await page.screenshot({ path: `${OUT}/${vp.name}-fresh.png` });
      log("fresh shot");

      // 2) Our turn (zoomed hand + YOUR TURN pill).
      await expect(page.getByText("YOUR TURN", { exact: true })).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${vp.name}-your-turn.png` });
      log("your-turn shot");

      // 3) Play lowest card that the UI accepts (else pass) -> pile shot.
      const ids = await handIds(page);
      let acted = false;
      for (const id of ids) {
        await page.getByTestId("player-hand").locator(`[data-card-id="${id}"]`).click({ position: { x: 8, y: 30 } });
        if (await page.getByRole("button", { name: "Play selected cards" }).isEnabled({ timeout: 1_500 }).catch(() => false)) {
          await page.getByRole("button", { name: "Play selected cards" }).click({ timeout: 10_000 });
          acted = true;
          break;
        }
      }
      if (!acted) {
        await page.getByRole("button", { name: "Pass", exact: true }).click({ timeout: 10_000 }).catch(() => undefined);
      }
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${vp.name}-pile.png` });
      log("pile shot");

      // 4) Keyboard focus ring on a hand card.
      const first = page.locator('[data-testid="player-hand"] [data-card-id]').first();
      if ((await first.count()) > 0) {
        await first.evaluate((el) => {
          (el as HTMLElement).focus({ focusVisible: true } as FocusOptions);
        });
        await page.waitForTimeout(300);
      }
      await page.screenshot({ path: `${OUT}/${vp.name}-focus.png` });

      // 5) No horizontal overflow.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${vp.name} overflow`).toBeLessThanOrEqual(1);
      log("done viewport");
    } finally {
      await page.context().close().catch(() => undefined);
    }
  }

  // 6) Reduced motion still renders a sane table.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const rp = await ctx.newPage();
  await rp.addInitScript(() => localStorage.setItem("murlan.username", "ShotRM"));
  try {
    await rp.goto("/");
    await rp.getByLabel(/Allow filling empty seats/).check();
    await rp.getByRole("button", { name: "Create room" }).click();
    await rp.waitForURL(/\/room\//, { timeout: 30_000 });
    await rp.getByRole("button", { name: "Ready up" }).click();
    await rp.getByRole("button", { name: "Start match" }).click();
    await expect(rp.getByTestId("player-hand")).toBeVisible({ timeout: 30_000 });
    const rm = await rp.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(rm).toBe(true);
    await rp.waitForTimeout(1500);
    await rp.screenshot({ path: `${OUT}/390x844-reduced-motion.png` });
  } finally {
    await ctx.close().catch(() => undefined);
  }

  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});
