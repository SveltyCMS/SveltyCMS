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
    await permissionsTab.click();

    const cellCheckboxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
    await expect(cellCheckboxes.first()).toBeVisible({
      timeout: 15_000,
    });

    const bodyCount = await cellCheckboxes.count();
    expect(bodyCount, "Expected toggleable permission checkboxes").toBeGreaterThan(0);

    const toToggle = Math.min(bodyCount, 3);
    for (let i = 0; i < toToggle; i++) {
      const cb = cellCheckboxes.nth(i);
      await cb.click({ force: true });
      await cb.dispatchEvent("change");
    }

    const saveBtn = page
      .getByTestId("access-mgmt-save")
      .or(page.getByRole("button", { name: /save all changes/i }));
    await expect(saveBtn.first()).toBeEnabled({ timeout: 15_000 });
    await saveBtn.first().click();

    await expect(
      page
        .getByText(/configuration updated successfully/i)
        .or(page.getByText(/updated successfully/i))
        .or(page.getByText(/saved/i)),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveURL(/access-management/i);
  });
});
