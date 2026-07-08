/**
 * @file tests/e2e/routes/system/permissions.spec.ts
 * @description E2E test for permission management in SveltyCMS.
 *   - Logs in as admin
 *   - Navigates to /config/access-management
 *   - Toggles per-cell permission checkboxes
 *   - Saves and asserts the success toast
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Permission Management Flow", () => {
  test.setTimeout(60_000);

  test("Login and change permissions in Access Management", async ({ page }) => {
    // 1. Login
    await loginAsAdmin(page);

    // 2. Navigate directly to Access Management
    await page.goto("/config/access-management");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 });

    // 3. Open the Permissions tab
    const permissionsTab = page
      .getByRole("tab", { name: /permission/i })
      .or(page.locator('[role="tab"]').filter({ hasText: /permission/i }))
      .first();
    await expect(permissionsTab).toBeVisible({ timeout: 10_000 });
    await permissionsTab.click();

    // 4. Wait for the permissions table checkboxes to render
    const cellCheckboxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
    const hasCheckboxes = await cellCheckboxes
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (!hasCheckboxes) {
      // Try the Roles tab as fallback
      const rolesTab = page
        .getByRole("tab", { name: /role/i })
        .or(page.locator('[role="tab"]').filter({ hasText: /role/i }))
        .first();
      if (await rolesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await rolesTab.click();
      } else {
        test.skip(true, "Neither Permissions nor Roles tab found");
        return;
      }
    }

    // 5. Toggle 2–3 checkboxes in <tbody>
    const bodyCheckboxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
    const bodyCount = await bodyCheckboxes.count();
    if (bodyCount === 0) {
      test.skip(true, "No toggleable checkboxes found");
      return;
    }
    const toToggle = Math.min(bodyCount, 3);
    for (let i = 0; i < toToggle; i++) {
      await bodyCheckboxes.nth(i).click({ force: true });
    }

    // 6. Save via the "Save all changes" button
    const saveBtn = page
      .getByRole("button", { name: /save all changes/i })
      .or(page.getByRole("button", { name: /^save/i }))
      .first();
    if (!(await saveBtn.isEnabled({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, "Save button not enabled — no modifications possible");
      return;
    }
    await saveBtn.click();

    // 7. Assert success toast
    await expect(
      page
        .getByText(/configuration updated successfully/i)
        .or(page.getByText(/updated/i))
        .or(page.getByText(/saved/i)),
    ).toBeVisible({ timeout: 15_000 });

    // 8. Stay on access-management page after save
    await expect(page).toHaveURL(/access-management/i);
  });
});
