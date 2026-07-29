/**
 * @file tests/e2e/routes/config/appearance-golden.spec.ts
 * @description Appearance theme golden: create → list → delete (admin). No soft-skip.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 25_000;

async function openAdminThemes(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/appearance", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: /admin theme settings/i })).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  // Admin tabs only for isAdmin
  const themesTab = page.getByTestId("appearance-tab-themes");
  await expect(themesTab, "Admin must see Themes tab for golden theme CRUD").toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  await themesTab.click();
  await expect(page.getByTestId("appearance-themes-panel")).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
}

test.describe.configure({ mode: "serial" });
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

    await page.getByTestId("appearance-theme-name").fill(name);
    await page.getByTestId("appearance-theme-create-btn").click();

    await expect(page.getByText(name).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.locator(`[data-theme-name="${name}"]`)).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Delete (confirm dialog)
    page.once("dialog", (d) => d.accept());
    const card = page.locator(`[data-theme-name="${name}"]`);
    await card.getByRole("button", { name: new RegExp(`Delete ${name}`, "i") }).click();

    await expect(page.locator(`[data-theme-name="${name}"]`)).toHaveCount(0, {
      timeout: ACTION_TIMEOUT,
    });
  });
});
