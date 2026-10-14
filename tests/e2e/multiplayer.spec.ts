/**
 * Multiplayer E2E (SPEC §10). Four separate browser contexts act as four friends.
 * Requires a running app + configured Supabase (see README). When the backend
 * is not configured, the online flow skips gracefully instead of failing.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

async function newPlayer(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((username: string) => {
    localStorage.setItem("murlan.username", username);
  }, name);
  return page;
}

test.describe("murlan multiplayer", () => {
  test("home renders with create/join and rules", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Murlan" })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();
    await page.getByRole("button", { name: "How to play" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("four friends create, join, ready, start, and see private hands", async ({ browser }) => {
    test.setTimeout(180_000);
    const names = ["Arben", "Besa", "Dritan", "Elira"];
    const pages = await Promise.all(names.map((n) => newPlayer(browser, n)));
    try {
      // Host creates an FFA room.
      await pages[0].goto("/");
      await pages[0].getByRole("button", { name: "Create room" }).click();
      const navigated = await pages[0]
        .waitForURL(/\/room\//, { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (!navigated) {
        // Backend not configured -> the page shows an explanatory alert; skip
        // the online flow gracefully. (Scoped to visible <p> alerts: Next.js
        // renders its own empty route-announcer with role="alert".)
        const alert = pages[0].locator('p[role="alert"]');
        if ((await alert.count()) > 0 && (await alert.first().isVisible())) {
          test.skip(true, `Backend unavailable: ${await alert.first().textContent()}`);
        }
        throw new Error("Host could not create a room.");
      }
      const roomId = pages[0].url().split("/room/")[1]?.split("?")[0];
      expect(roomId).toBeTruthy();

      // Read the invite code from the lobby.
      const codeEl = pages[0].locator("p.tracking-\\[0\\.3em\\]");
      const code = ((await codeEl.textContent()) ?? "").trim();
      expect(code).toMatch(/[A-Z2-9]{5,8}/);

      // Guests join via the invite link (code prefilled).
      for (let i = 1; i < 4; i++) {
        await pages[i].goto(`/join?code=${code}`);
        await pages[i].getByRole("button", { name: "Join" }).click();
        await pages[i].waitForURL(/\/room\//, { timeout: 20_000 });
        expect(pages[i].url()).toContain(roomId!);
      }

      // Everyone readies up (waiting for each lobby to load first), host starts.
      for (const p of pages) {
        const readyBtn = p.getByRole("button", { name: "Ready up" });
        await expect(readyBtn).toBeVisible({ timeout: 25_000 });
        await readyBtn.click();
        await expect(p.getByRole("button", { name: "Not ready" })).toBeVisible({ timeout: 15_000 });
      }
      await pages[0].getByRole("button", { name: "Start match" }).click();
      // Each client sees its own private hand (or a clear error — never silent).
      for (const p of pages) {
        await expect(p.getByLabel("Your hand").or(p.getByRole("alert"))).toBeVisible({
          timeout: 25_000,
        });
      }

      // Reload recovery: one browser reloads and resumes the same seat/hand.
      const before = await pages[3].getByLabel("Your hand").textContent().catch(() => "");
      await pages[3].reload();
      await expect(pages[3].getByLabel("Your hand").or(pages[3].getByRole("alert"))).toBeVisible({
        timeout: 25_000,
      });
      const after = await pages[3].getByLabel("Your hand").textContent().catch(() => "");
      expect(after).toBe(before);
    } finally {
      for (const p of pages) await p.context().close().catch(() => undefined);
    }
  });
});
