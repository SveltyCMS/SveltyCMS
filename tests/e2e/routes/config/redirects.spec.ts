/**
 * @file tests/e2e/routes/config/redirects.spec.ts
 * @description Redirects E2E — Testing 2026 golden journey + minimal shell.
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { confirmModal } from "../../helpers/confirm-modal";

const ACTION_TIMEOUT = 20_000;

async function goRedirects(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/redirects", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await expect(page.getByTestId("page-title")).toContainText(/redirect/i);
  await expect(page.getByTestId("redirects-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Redirect Manager (Testing 2026)", () => {
  test.setTimeout(120_000);

  test("shell: add control present", async ({ page }) => {
    await goRedirects(page);
    await expect(page.getByTestId("redirects-add")).toBeVisible();
  });

  test("golden: create → search → delete", async ({ page }) => {
    await goRedirects(page);

    const stamp = Date.now().toString(36).slice(-6);
    const fromPath = `/e2e-old-${stamp}`;
    const toPath = `/e2e-new-${stamp}`;

    await page.getByTestId("redirects-add").click();
    await expect(page.getByTestId("redirects-modal")).toBeVisible({ timeout: ACTION_TIMEOUT });

    await page.getByTestId("redirect-from").fill(fromPath);
    await page.getByTestId("redirect-to").fill(toPath);
    await page.getByTestId("redirect-save").click();

    await expect(page.getByTestId("redirects-modal")).toHaveCount(0, {
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByText(fromPath).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    await page.getByTestId("redirects-search").fill(fromPath);
    await expect(page.getByText(fromPath).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    const row = page.locator(`tr[data-from="${fromPath}"]`);
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });
    await row.getByTestId("redirect-delete").click();
    await confirmModal(page);
    await expect(page.getByText(fromPath)).toHaveCount(0, { timeout: ACTION_TIMEOUT });
  });
});
