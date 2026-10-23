/**
 * @file tests/e2e/routes/admin/rbac-journey.spec.ts
 * @description RBAC & Non-Admin (Editor) Journey E2E.
 *
 * Verifies that the CMS functions reliably for non-superusers:
 * - Editor user can log in and reach authenticated editorial surfaces
 * - Administrative surfaces (/config/access-management) strictly guard access
 * - Navigation across restricted boundaries fails closed with clean UX
 * - Zero unhandled client-side runtime errors or undefined variable crashes
 *
 * ### Features:
 * - Seeds and authenticates an Editor role user via `loginAsEditor`
 * - Tests permission boundaries without relying on test-bypass
 * - Validates profile accessibility and admin-area omission
 * - Enforces zero-error contract (`assertNoZeroErrors`)
 */

import { expect, test } from "@playwright/test";
import { prepareTestUser, resetAndSeedDatabase } from "../../helpers/api";
import { loginAsEditor } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";
import { assertNoZeroErrors, attachZeroErrorGuard } from "../../helpers/zero-error-guard";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("Editor Role Boundary — Non-Admin Experience", () => {
  test.beforeEach(async ({ page }) => {
    attachZeroErrorGuard(page);
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
    await prepareTestUser(page, "editor");
  });

  test.afterEach(async ({ page }) => {
    assertNoZeroErrors(page);
  });

  test("editor can view profile and is cleanly restricted from admin-only configuration", async ({
    page,
  }) => {
    // 1. Log in as Editor
    await loginAsEditor(page, "/user");

    // 2. Editor should see their identity panel but NOT the superuser Admin Area
    await expect(page.getByTestId("user-identity-panel")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("user-admin-area")).toHaveCount(0);

    // 3. Attempt direct navigation to restricted Access Management route
    await page.goto("/config/access-management", { waitUntil: "domcontentloaded" });

    // 4. Access must be restricted: either redirected or 403 / denied view presented
    // It must NEVER result in an uncaught JavaScript runtime crash.
    await expect(async () => {
      const url = page.url();
      const isRedirected = url.includes("/login") || url.includes("/user") || url.endsWith("/");
      const hasDeniedText = await page
        .getByText(/access denied|unauthorized|forbidden|kein zugriff/i)
        .first()
        .isVisible()
        .catch(() => false);
      const hasRestrictedHeading = await page
        .getByRole("heading", { name: /access denied|forbidden|error/i })
        .first()
        .isVisible()
        .catch(() => false);

      expect(
        isRedirected || hasDeniedText || hasRestrictedHeading,
        `Expected access control response for Editor at /config/access-management, got ${url}`,
      ).toBe(true);
    }).toPass({ timeout: 15_000, intervals: [1_000, 2_000] });

    // 5. Sidebar check: Access management link should not be accessible in the UI
    const accessMgmtLink = page.getByRole("link", {
      name: /access management|zugriffsverwaltung/i,
    });
    expect(await accessMgmtLink.count()).toBe(0);
  });
});
