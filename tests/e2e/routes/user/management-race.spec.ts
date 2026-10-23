/**
 * @file tests/e2e/routes/user/management-race.spec.ts
 * @description Out-of-order response guard for the User Management table.
 *
 * `fetchData` used to write every response straight into the shared controller.
 * A slower Users request started before switching to Invitations could land
 * afterwards and replace the token rows with user rows. The table must only
 * accept the result of the request that still matches the active view.
 *
 * | Layer | Coverage |
 * | ----- | -------- |
 * | E2E | this file (deterministic delayed response via `page.route`) |
 */

import { expect, test } from "@playwright/test";
import { resetAndSeedDatabase, seedInviteToken } from "../../helpers/api";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";
import { goToUserPage, openTokenView, openUserManagement } from "../../helpers/user-page";

test.describe.configure({ mode: "serial", timeout: 120_000 });
// Force an anonymous context — the seeded session comes from resetAndSeedDatabase.
test.use({ storageState: { cookies: [], origins: [] } });

const STALE_EMAIL = "stale-users-response@example.test";

test.describe("User management - in-flight table requests", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
  });

  test("an older users response cannot overwrite the active token table", async ({ page }) => {
    const seeded = await seedInviteToken(page, { role: "editor" });

    let releaseUsers!: () => void;
    const usersGate = new Promise<void>((resolve) => {
      releaseUsers = resolve;
    });
    let usersRequested!: () => void;
    const usersRequestStarted = new Promise<void>((resolve) => {
      usersRequested = resolve;
    });
    let usersSettled!: () => void;
    const usersSettlement = new Promise<void>((resolve) => {
      usersSettled = resolve;
    });
    let heldOnce = false;

    // Hold the first Users list request so the view switch happens while it is pending.
    await page.route(
      (url) => url.pathname === "/api/user",
      async (route) => {
        if (route.request().method() !== "GET" || heldOnce) {
          await route.fallback();
          return;
        }
        heldOnce = true;
        usersRequested();
        await usersGate;
        try {
          // Synthetic payload: a stale write is unambiguous and cannot be confused
          // with the seeded user/email rows the real API would return.
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: [
                {
                  _id: "stale-user",
                  email: STALE_EMAIL,
                  username: "stale-user",
                  role: "user",
                  blocked: false,
                },
              ],
              pagination: { totalItems: 4242 },
            }),
          });
        } catch {
          // The view switch aborted this request (AbortController path) — nothing lands.
        } finally {
          usersSettled();
        }
      },
    );

    await goToUserPage(page);
    await openUserManagement(page);
    await usersRequestStarted;

    // Register before the click so a fast local response cannot be missed.
    const tokenResponse = page.waitForResponse(
      (res) => new URL(res.url()).pathname === "/api/token" && res.request().method() === "GET",
      { timeout: 20_000 },
    );

    // Switch to Invitations while the older Users request is still in flight.
    await openTokenView(page);
    await expect(page.getByTestId("admin-tab-tokens")).toHaveAttribute("aria-selected", "true");
    await tokenResponse;

    const adminArea = page.getByTestId("user-admin-area");
    // Invite-token emails only exist in the token view, so a visible row proves
    // the active table holds token rows (the locale-independent marker).
    const tokenRow = adminArea.getByRole("row").filter({ hasText: seeded.email });
    await expect(tokenRow).toBeVisible({ timeout: 20_000 });

    // Let the older response land, then let the page flush the fetch continuation.
    releaseUsers();
    await usersSettlement;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );

    // The token view must be untouched — no stale user rows, no pagination flip.
    await expect(page.getByTestId("admin-tab-tokens")).toHaveAttribute("aria-selected", "true");
    await expect(tokenRow).toBeVisible();
    await expect(adminArea).not.toContainText(STALE_EMAIL);
  });
});
