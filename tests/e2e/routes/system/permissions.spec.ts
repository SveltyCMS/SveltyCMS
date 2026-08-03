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

    // Wait for the permissions data to hydrate
    await expect(page.locator("table tbody tr").first()).toBeVisible({
      timeout: 15_000,
    });

    // Control-map row: the permission grid MUST hydrate — no soft-skip allowed.
    // Scope to tbody: the thead holds per-role "select all filtered permissions"
    // header checkboxes — toggling those grants/wipes EVERY permission for a
    // role and would poison the shared DB for downstream serial specs.
    const toggleableCheckboxes = page.locator('table tbody input[type="checkbox"]:not([disabled])');
    await expect
      .poll(async () => await toggleableCheckboxes.count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Remember the pre-toggle state so we can restore the grants afterwards —
    // other serial specs share this DB and must not inherit altered permissions.
    const before = new Map<number, boolean>();
    const toToggle = Math.min(await toggleableCheckboxes.count(), 3);
    for (let i = 0; i < toToggle; i++) {
      const cb = toggleableCheckboxes.nth(i);
      before.set(i, await cb.isChecked());
      // Toggle explicitly (AGENTS.md pitfall #16): check() is a no-op when the
      // box is already checked, leaving the save button disabled. Click flips
      // the state and always fires change.
      await cb.click({ force: true, timeout: 5_000 });
    }

    const saveBtn = page
      .getByTestId("access-mgmt-save")
      .or(page.getByRole("button", { name: /save all changes/i }));
    await expect(saveBtn.first()).toBeEnabled({ timeout: 15_000 });

    const saveDone = page
      .waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes("/api/user/update-roles") &&
          res.status() < 400,
        { timeout: 15_000 },
      )
      .catch(() => null);
    await saveBtn.first().click();
    await saveDone;

    // Wait for loading overlay to disappear before checking for toast
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/access-management/i);
    await expect(page.getByText(/configuration updated/i)).toBeVisible({ timeout: 15_000 });

    // Restore the original grants so downstream serial specs are unaffected.
    for (let i = 0; i < toToggle; i++) {
      const cb = toggleableCheckboxes.nth(i);
      const wantChecked = before.get(i) ?? false;
      if ((await cb.isChecked()) !== wantChecked) {
        await cb.click({ force: true, timeout: 5_000 });
      }
    }
    const restoreDone = page
      .waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes("/api/user/update-roles") &&
          res.status() < 400,
        { timeout: 15_000 },
      )
      .catch(() => null);
    await expect(saveBtn.first()).toBeEnabled({ timeout: 15_000 });
    await saveBtn.first().click();
    await restoreDone;
    await expect(page.getByText(/configuration updated/i)).toBeVisible({ timeout: 15_000 });
  });
});
