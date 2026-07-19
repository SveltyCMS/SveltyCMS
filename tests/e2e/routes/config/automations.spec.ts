/**
 * @file tests/e2e/routes/config/automations.spec.ts
 * @description Automations E2E — Testing 2026: golden builder journey + minimal shell.
 * Soft-skip banned; seeds via /api/testing when needed outside golden create path.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { confirmModal } from "../../helpers/confirm-modal";
import { deleteAutomation, seedAutomation } from "../../helpers/seed";
import {
  dismissCookieBannerIfPresent,
  waitForAdminShell,
  waitForLoadingGone,
} from "../../helpers/stable";

const ACTION_TIMEOUT = 20_000;

async function goAutomations(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/automations", { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/config/automations");
  }
  await dismissCookieBannerIfPresent(page);
  await waitForAdminShell(page, ACTION_TIMEOUT);
  await expect(page.getByTestId("page-title")).toContainText(/automation/i, {
    timeout: ACTION_TIMEOUT,
  });
  await expect(page.getByTestId("automations-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await waitForLoadingGone(page, "automations-loading", ACTION_TIMEOUT);
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Automations (Testing 2026)", () => {
  test.setTimeout(120_000);

  test("shell: page and new control", async ({ page }) => {
    await goAutomations(page);
    await expect(page.getByTestId("automations-new")).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("search empty state with seeded fixture (no soft-skip)", async ({ page }) => {
    await loginAsAdmin(page);
    const seeded = await seedAutomation(page, {
      name: `E2E Search Base ${Date.now().toString(36)}`,
    });
    try {
      await page.goto("/config/automations", {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await waitForLoadingGone(page, "automations-loading", ACTION_TIMEOUT);

      // Poll until seed is visible OR empty shell is ready (no fixed sleep)
      await expect(async () => {
        const listOrEmpty = page
          .getByTestId("automations-list")
          .or(page.getByTestId("automations-empty"));
        await expect(listOrEmpty).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: ACTION_TIMEOUT });

      await expect(page.getByTestId("automations-search")).toBeVisible({
        timeout: ACTION_TIMEOUT,
      });
      await page.getByTestId("automations-search").fill("zzzz-no-automation-xyz-999");
      await expect(
        page
          .getByTestId("automations-search-empty")
          .or(page.getByText(/no automation|no results|nothing found/i)),
      ).toBeVisible({ timeout: ACTION_TIMEOUT });
    } finally {
      await deleteAutomation(page, seeded.id).catch(() => {});
    }
  });

  /**
   * Golden journey — create via builder → list → open editor → delete.
   */
  test("golden: builder create → list → edit → delete", async ({ page }) => {
    await goAutomations(page);
    await page.getByTestId("automations-new").click();
    await expect(page.getByTestId("automation-editor")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    const stamp = Date.now().toString(36);
    const name = `E2E Golden ${stamp}`;

    await page.getByTestId("automation-name").fill(name);
    await page.getByTestId("automation-trigger-manual").click();
    await page.getByTestId("automation-next").click();

    await expect(page.getByTestId("automation-add-ops")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.getByTestId("automation-add-op-log").click();
    await page.getByTestId("automation-next").click();

    // Sticky page-actions duplicates toolbar save — always use .first()
    await page.getByTestId("automation-save").first().click();
    await expect(page).toHaveURL(/\/config\/automations\/?$/, { timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("automations-loading")).toHaveCount(0, {
      timeout: ACTION_TIMEOUT,
    });
    await waitForLoadingGone(page, "automations-loading", ACTION_TIMEOUT);

    // Prefer data-* card contract over free-text (avoids toast/list duplicates)
    const card = page.locator(`[data-automation-name="${name}"]`);
    await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Open editor via the card's view link only (avoid checkbox label strict-mode)
    await card.getByRole("link", { name: /view automation/i }).click();
    await expect(page).toHaveURL(/\/config\/automations\/[^/]+/, { timeout: ACTION_TIMEOUT });
    await expect(
      page.getByTestId("automation-editor").or(page.getByTestId("automation-editor-loading")),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("automation-editor")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("automation-name")).toHaveValue(name, {
      timeout: ACTION_TIMEOUT,
    });

    await page.goto("/config/automations", { waitUntil: "domcontentloaded" });
    await waitForLoadingGone(page, "automations-loading", ACTION_TIMEOUT);
    await expect(page.getByTestId("automations-list")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    const listCard = page.locator(`[data-automation-name="${name}"]`);
    await expect(listCard).toBeVisible({ timeout: ACTION_TIMEOUT });
    await listCard.getByTestId("automation-delete").click();
    await confirmModal(page);
    await expect(page.locator(`[data-automation-name="${name}"]`)).toHaveCount(0, {
      timeout: ACTION_TIMEOUT,
    });
  });
});
