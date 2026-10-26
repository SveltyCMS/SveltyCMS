/**
 * @file tests/e2e/routes/config/appearance-golden.spec.ts
 * @description Appearance theme golden: create → list → delete (admin). No soft-skip.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { runAfterHydration } from "../../helpers/hydration";

const ACTION_TIMEOUT = 25_000;

async function openAdminThemes(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/design-system?tab=themes", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { level: 1, name: /design system/i })).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  // Admin tabs only for isAdmin
  const themesTab = page.getByTestId("appearance-tab-themes");
  await expect(themesTab, "Admin must see Themes tab for golden theme CRUD").toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  await runAfterHydration(page, () => themesTab.click(), { selector: themesTab });
  await expect(page.getByTestId("appearance-themes-panel")).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
}

// Tests are independent (unique theme names, fresh storageState per test) — no
// serial mode needed, so the file parallelizes across workers on local runs.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Appearance — theme golden", () => {
  test.setTimeout(120_000);

  test("shell: themes tab and create form", async ({ page }) => {
    await openAdminThemes(page);
    await expect(page.getByTestId("appearance-theme-list")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("appearance-theme-create")).toBeVisible();
    await expect(page.getByTestId("appearance-theme-name")).toBeVisible();
    await expect(page.getByTestId("appearance-theme-create-btn")).toBeVisible();
  });

  test("golden: create theme → visible in list → delete", async ({ page }) => {
    await openAdminThemes(page);

    const stamp = Date.now().toString(36);
    const name = `E2E Theme ${stamp}`;

    await runAfterHydration(
      page,
      async () => {
        await page.getByTestId("appearance-theme-name").fill(name);
        await page.getByTestId("appearance-theme-create-btn").click();
      },
      { selector: page.getByTestId("appearance-theme-create-btn") },
    );

    // The server is the source of truth: the in-memory list is re-fetched after
    // create, which can race a busy shard. Poll a full reload until the card is
    // there; a create that genuinely failed never converges.
    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("appearance-theme-list")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator(`[data-theme-name="${name}"]`)).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 45_000, intervals: [1_000, 2_000, 3_000] });

    // Delete (native confirm dialog)
    page.once("dialog", (d) => d.accept());
    const card = page.locator(`[data-theme-name="${name}"]`);
    await runAfterHydration(
      page,
      () => card.getByRole("button", { name: new RegExp(`Delete ${name}`, "i") }).click(),
      { selector: card },
    );

    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("appearance-theme-list")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator(`[data-theme-name="${name}"]`)).toHaveCount(0, {
        timeout: 5_000,
      });
    }).toPass({ timeout: 45_000, intervals: [1_000, 2_000, 3_000] });
  });
});
