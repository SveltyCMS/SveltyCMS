/**
 * @file tests/e2e/routes/user/profile-preferences.spec.ts
 * @description Browser contract for the personal User Profile screen (`/user`).
 *
 * Pins two audit items: (1) a harmless boolean preference (Reduced motion) can be
 * toggled, saved, and read back after a reload; and (2) org-wide management
 * surfaces (user admin area, bulk actions, user/token sub-tabs, invite button)
 * do NOT appear on the personal profile (Identity) surface.
 */

import { test, expect } from "../../fixtures";
import { loginAsAdmin } from "../../helpers/auth";
import { goToUserPage, openSettingsTab, USER_ACTION_TIMEOUT } from "../../helpers/user-page";

test.describe("User profile preferences", () => {
  test.setTimeout(90_000);

  test("toggles a harmless preference, saves, and persists on reload", async ({ page }) => {
    await loginAsAdmin(page);
    await goToUserPage(page);
    await openSettingsTab(page);

    const reducedMotion = page.getByRole("switch", { name: /reduced motion/i });
    await expect(reducedMotion).toBeVisible({ timeout: USER_ACTION_TIMEOUT });

    const before = (await reducedMotion.getAttribute("aria-checked")) === "true";
    await reducedMotion.click();
    await expect(reducedMotion).toHaveAttribute("aria-checked", String(!before));

    // Save and await the persistence write (not the auto-dismissing toast).
    const saveResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/user/update-user-attributes") && res.request().method() === "PUT",
      { timeout: 15_000 },
    );
    await page.getByTestId("user-save-appearance-btn").click();
    const res = await saveResponse;
    expect(res.ok(), `PUT ${res.status()} ${res.url()}`).toBe(true);

    // Reload and assert the preference survived the round-trip.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await openSettingsTab(page);
    await expect(page.getByRole("switch", { name: /reduced motion/i })).toHaveAttribute(
      "aria-checked",
      String(!before),
    );
  });

  test("does not surface org-wide management on the personal profile", async ({ page }) => {
    await loginAsAdmin(page);
    await goToUserPage(page);

    // Identity is the default personal-profile surface.
    await expect(page.getByTestId("user-identity-panel")).toBeVisible({
      timeout: USER_ACTION_TIMEOUT,
    });

    // Org-wide management surfaces live behind the "User Management" tab and must
    // not leak onto the personal profile.
    await expect(page.getByTestId("user-admin-area")).toHaveCount(0);
    await expect(page.getByTestId("admin-tab-users")).toHaveCount(0);
    await expect(page.getByTestId("admin-tab-tokens")).toHaveCount(0);
    await expect(page.getByTestId("user-bulk-actions-menu")).toHaveCount(0);
    await expect(page.getByTestId("email-registration-token-btn")).toHaveCount(0);
  });
});
