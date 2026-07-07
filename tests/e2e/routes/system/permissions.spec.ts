/**
 * @file tests/e2e/routes/system/permissions.spec.ts
 * @description Playwright E2E test for permission management in SveltyCMS.
 *   - Logs in as admin
 *   - Navigates to /config/access-management (direct, post native-UI migration
 *     the sidebar "System Configuration" link is an icon-only link Playwright
 *     cannot click reliably)
 *   - Opens the Permissions tab
 *   - Toggles 2–3 per-cell permission checkboxes (always produces a modification)
 *   - Saves and asserts the success toast
 *
 * NOTE: This overlaps with routes/config/access-management.spec.ts (which covers
 * page load, tabs, and save-button-disabled state). This spec specifically
 * exercises the full modify → save → confirm flow.
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Permission Management Flow", () => {
  test.setTimeout(60_000); // 1 min

  test("Login and change permissions in Access Management", async ({ page }) => {
    // 1. Login
    await loginAsAdmin(page);

    // 2. Navigate directly to Access Management.
    // The sidebar "System Configuration" link is an icon-only link in the
    // native UI and is not reliably clickable; direct navigation is the
    // pattern used by the green config/access-management.spec.ts.
    await page.goto("/config/access-management");
    await expect(page.getByRole("heading", { level: 1, name: /access management/i })).toBeVisible({
      timeout: 10_000,
    });

    // 3. Open the Permissions tab.
    await page.getByRole("tab", { name: /permissions/i }).click();

    // 4. Toggle 2–3 per-cell permission checkboxes. Per-cell checkboxes live
    //    in <tbody><td>; the per-role "select all" header checkboxes live in
    //    <thead><th> and would mass-toggle, so scope to tbody. Toggling (click)
    //    always fires onchange → always produces a modification, regardless of
    //    the checkbox's initial state (check or uncheck both count as modified).
    const cellCheckboxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
    await expect(cellCheckboxes.first()).toBeVisible({ timeout: 10_000 });
    const count = await cellCheckboxes.count();
    const toToggle = Math.min(count, 3);

    for (let i = 0; i < toToggle; i++) {
      await cellCheckboxes.nth(i).click({ force: true });
    }

    // 5. Save. The Save button has aria-label="Save all changes" and is
    //    disabled until modifications exist (hasModifiedChanges). After
    //    toggling above it must be enabled.
    const saveBtn = page.getByRole("button", { name: /save/i }).first();
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
    await saveBtn.click();

    // 6. Assert success. saveAllChanges() posts to /api/permission/update and
    //    on success shows toast.success("Configuration updated successfully!").
    await expect(page.getByText(/configuration updated successfully/i)).toBeVisible({
      timeout: 15_000,
    });

    // We remain on the access-management page.
    await expect(page).toHaveURL(/access-management/i);
  });
});
