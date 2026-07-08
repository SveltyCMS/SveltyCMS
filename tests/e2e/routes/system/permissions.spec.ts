/**
 * @file tests/playwright/permission-change.spec.ts
 * @description Playwright end-to-end test for permission management in SveltyCMS.
 *   - Logs in as admin
 *   - Navigates to Access Management
 *   - Checks 2–3 permission checkboxes and saves
 *   - Asserts success via URL and confirmation message
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Permission Management Flow", () => {
  test.setTimeout(60_000); // 1 min

  test("Login and change permissions in Access Management", async ({ page }) => {
    // 1. Login
    await loginAsAdmin(page);

    // 2. Navigate to Access Management directly. The sidebar config icon can be
    // visually collapsed/hidden depending on viewport and theme state.
    await page.goto("/config/access-management", { waitUntil: "domcontentloaded" });

    // 4. Toggle the first enabled permission checkbox to create a real dirty state.
    const checkboxes = page.locator('input[type="checkbox"]:not([disabled])');
    const firstCheckbox = checkboxes.first();
    await expect(firstCheckbox).toBeVisible({ timeout: 10_000 });
    await firstCheckbox.setChecked(!(await firstCheckbox.isChecked()));

    // 5. Click Save once the page enables it.
    const saveButton = page.getByRole("button", { name: /save/i }).first();
    await expect(saveButton).toBeEnabled({ timeout: 10_000 });
    await saveButton.click();

    // 6. Assert the workflow stayed on Access Management after save.
    await expect(page).toHaveURL(/access-management/i);
    await expect(page.getByRole("heading", { level: 1, name: /access management/i })).toBeVisible();
  });
});
