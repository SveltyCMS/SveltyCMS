/**
 * @file tests/e2e/routes/system/permissions.spec.ts
 * @description E2E permission toggle + save on Access Management (no soft-skip).
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Permission Management Flow", () => {
  test.setTimeout(60_000);

  test("toggle permissions and save", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/config/access-management", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("access-mgmt-page")).toBeVisible({ timeout: 15_000 });

    // Prefer stable testids from access-management hardening
    const permissionsTab = page.getByTestId("access-tab-permissions");
    await expect(permissionsTab).toBeVisible({ timeout: 15_000 });
    // Only click if not already active (aria-current !== 'page')
    const isActive = (await permissionsTab.getAttribute("aria-current")) === "page";
    if (!isActive) await permissionsTab.click();

    // Wait for the permissions table to render with checkboxes (data may load async)
    await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });
    // Wait for at least one checkbox to appear (roles + permissions loaded)
    const cellCheckboxes = page.locator('input[type="checkbox"]');
    await expect(async () => {
      const count = await cellCheckboxes.count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });
    // Filter to only non-disabled checkboxes
    const toggleableCheckboxes = cellCheckboxes.locator(":not([disabled])");

    const bodyCount = await toggleableCheckboxes.count();
    expect(bodyCount, "Expected toggleable permission checkboxes").toBeGreaterThan(0);

    const toToggle = Math.min(bodyCount, 3);
    for (let i = 0; i < toToggle; i++) {
      const cb = toggleableCheckboxes.nth(i);
      await cb.click({ force: true });
      await cb.dispatchEvent("change");
    }

    const saveBtn = page
      .getByTestId("access-mgmt-save")
      .or(page.getByRole("button", { name: /save all changes/i }));
    await expect(saveBtn.first()).toBeEnabled({ timeout: 15_000 });

    // Wait for the save API response before checking UI feedback
    const saveDone = page
      .waitForResponse((res) => res.url().includes("/api/permission/") && res.status() < 400, {
        timeout: 15_000,
      })
      .catch(() => null);
    await saveBtn.first().click();
    await saveDone;

    // Verify the page is still on access-management and save completed
    await expect(page).toHaveURL(/access-management/i);
    await expect(saveBtn.first()).toBeDisabled({ timeout: 10_000 });
  });
});
