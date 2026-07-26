/**
 * @file tests/e2e/routes/system/permissions.spec.ts
 * @description E2E permission toggle + save on Access Management.
 *
 * Uses checkbox.check({ force: true }) for hidden Checkbox component inputs
 * and waitForResponse for save completion instead of disabled-state polling.
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

    const permissionsTab = page.getByTestId("access-tab-permissions");
    await expect(permissionsTab).toBeVisible({ timeout: 15_000 });
    const isActive = (await permissionsTab.getAttribute("aria-current")) === "page";
    if (!isActive) await permissionsTab.click();

    // Wait for the permissions table to render
    await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });

    // Wait for at least one checkbox to render
    const cellCheckboxes = page.locator('input[type="checkbox"]');
    await expect(async () => {
      const count = await cellCheckboxes.count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });

    // Filter to non-disabled, toggle up to 3.
    // Combines selector into one locator — chaining .locator() creates
    // descendant queries, but <input> is a void element with no children.
    const toggleableCheckboxes = page.locator('input[type="checkbox"]:not([disabled])');
    const bodyCount = await toggleableCheckboxes.count();
    expect(bodyCount, "Expected toggleable permission checkboxes").toBeGreaterThan(0);

    const toToggle = Math.min(bodyCount, 3);
    for (let i = 0; i < toToggle; i++) {
      const cb = toggleableCheckboxes.nth(i);
      // check({ force: true }) dispatches click + input + change events
      // that Svelte's onchange handler reliably receives
      await cb.check({ force: true, timeout: 5_000 });
    }

    const saveBtn = page
      .getByTestId("access-mgmt-save")
      .or(page.getByRole("button", { name: /save all changes/i }));
    await expect(saveBtn.first()).toBeEnabled({ timeout: 15_000 });

    // Wait for save API response instead of polling button disabled state
    const saveDone = page
      .waitForResponse((res) => res.url().includes("/api/permission/") && res.status() < 400, {
        timeout: 15_000,
      })
      .catch(() => null);
    await saveBtn.first().click();
    await saveDone;

    // Verify we're still on the page (no redirect/error)
    await expect(page).toHaveURL(/access-management/i);
    // Save button should return to disabled state after save completes
    await expect(async () => {
      await expect(saveBtn.first()).toBeDisabled();
    }).toPass({ timeout: 15_000 });
  });
});
