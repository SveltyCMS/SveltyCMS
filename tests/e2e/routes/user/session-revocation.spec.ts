/**
 * @file tests/e2e/routes/user/session-revocation.spec.ts
 * @description E2E browser tests for active session inspection and revocation.
 *
 * Verifies that:
 * 1. An authenticated admin sees their active browser session listed in the Security tab.
 * 2. Revoking an active session invalidates the session token immediately on the server.
 * 3. Subsequent page loads with the revoked session are rejected and redirect to /login.
 * 4. Subsequent API calls with the revoked session return 401 Unauthorized.
 *
 * ### Features:
 * - Security tab displays active sessions with current session badge
 * - Session revocation via DELETE /api/user/sessions/:id
 * - Immediate eviction from server session cache and DB session store
 * - Unauthenticated redirect to /login on subsequent protected navigation
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { resetAndSeedDatabase } from "../../helpers/api";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";
import { goToUserPage, openSecurityTab } from "../../helpers/user-page";

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Session inspection and revocation", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
  });

  test("active session appears in security tab and revoking it immediately invalidates access", async ({
    page,
  }) => {
    // 1. Log in as admin and navigate to the user profile
    await loginAsAdmin(page);
    await goToUserPage(page);

    // 2. Open Security tab and wait for active sessions section
    await openSecurityTab(page);
    const sessionsSection = page.getByTestId("active-sessions-section");
    await expect(sessionsSection).toBeVisible({ timeout: 15_000 });

    // 3. Confirm at least one session group and current session indicator
    const currentMember = page.getByTestId("session-member-current");
    await expect(currentMember).toBeVisible({ timeout: 15_000 });

    // 4. Query active sessions from API to retrieve current session ID
    const sessionsRes = await page.request.get("/api/user/sessions");
    expect(sessionsRes.ok()).toBe(true);
    const sessionsData = await sessionsRes.json();
    const sessionsList = Array.isArray(sessionsData?.sessions) ? sessionsData.sessions : [];
    expect(sessionsList.length).toBeGreaterThan(0);

    const currentSession = sessionsList.find((s: Record<string, unknown>) => s.isCurrent === true);
    expect(currentSession).toBeTruthy();
    const sessionId = String(currentSession._id || currentSession.id);

    // 5. Revoke the current session via DELETE endpoint
    const revokeRes = await page.request.delete(`/api/user/sessions/${sessionId}`);
    expect(revokeRes.ok()).toBe(true);
    const revokeBody = await revokeRes.json();
    expect(revokeBody?.message).toContain("revoked");

    // 6. Assert immediate invalidation: API access with the revoked session returns 401
    const verifyApi = await page.request.get("/api/user/me");
    expect(verifyApi.status()).toBe(401);

    // 7. Assert browser navigation: reloading or navigating to /user immediately redirects to /login
    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page).toHaveURL(/\/(login|setup)/, { timeout: 15_000 });
  });
});
