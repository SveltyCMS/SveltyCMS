/**
 * @file tests/e2e/routes/config/webhooks.spec.ts
 * @description Webhooks E2E — Testing 2026 reference: golden journey + minimal shell guards.
 *
 * - Soft-skip banned; seed only when a list fixture is needed outside the golden path.
 * - One outcome journey: create → list → reload → delete.
 * - Testids limited to control-map risks (add/save/delete/modal/page).
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { confirmModal } from "../../helpers/confirm-modal";
import {
  dismissCookieBannerIfPresent,
  waitForAdminShell,
  waitForLoadingGone,
} from "../../helpers/stable";

const ACTION_TIMEOUT = 20_000;

async function goWebhooks(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/webhooks", { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/config/webhooks");
  }
  await dismissCookieBannerIfPresent(page);
  await waitForAdminShell(page, ACTION_TIMEOUT);
  await expect(page.getByTestId("page-title")).toContainText(/webhook/i, {
    timeout: ACTION_TIMEOUT,
  });
  await expect(page.getByTestId("webhooks-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await waitForLoadingGone(page, "webhooks-loading", ACTION_TIMEOUT);
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Webhooks (Testing 2026 reference)", () => {
  test.setTimeout(120_000);

  /** Minimal shell: primary entry control only */
  test("shell: page and add control", async ({ page }) => {
    await goWebhooks(page);
    await expect(page.getByTestId("webhooks-add")).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  /**
   * Golden journey — sole mutation proof.
   * Create → visible in list → reload persists → delete via confirm.
   */
  test("golden: create → list → reload → delete", async ({ page }) => {
    await goWebhooks(page);

    const stamp = Date.now().toString(36);
    const name = `E2E Golden ${stamp}`;
    const url = `https://example.com/e2e-golden/${stamp}`;

    await page.getByTestId("webhooks-add").click();
    await expect(page.getByTestId("webhooks-modal")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Validation guard (control risk: cannot save empty)
    await page.getByTestId("webhook-save").click();
    await expect(page.getByTestId("webhooks-modal")).toBeVisible();

    await page.getByTestId("webhook-name").fill(name);
    await page.getByTestId("webhook-url").fill(url);
    await page.getByTestId("webhook-save").click();

    await expect(page.getByTestId("webhooks-modal")).toHaveCount(0, {
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Polling reload: SQLite WAL may not flush before the first read
    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("webhooks-loading")).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 25_000 });

    const card = page.locator(`[data-webhook-name="${name}"]`);
    await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT });
    await card.getByTestId("webhook-delete").click();
    await confirmModal(page);
    await expect(page.getByText(name)).toHaveCount(0, { timeout: ACTION_TIMEOUT });
  });
});
