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
import { runAfterHydration } from "../../helpers/hydration";
import { goToUserPage, openTokenView, openUserManagement } from "../../helpers/user-page";

test.describe.configure({ mode: "serial", timeout: 120_000 });
// Force an anonymous context — the seeded session comes from resetAndSeedDatabase.
test.use({ storageState: { cookies: [], origins: [] } });

const STALE_EMAIL = "stale-users-response@example.test";

/** True when the context currently carries a session the API accepts. */
async function hasAdminSession(page: import("@playwright/test").Page): Promise<boolean> {
  const res = await page.request.get("/api/user?page=1&limit=1");
  return res.ok();
}

test.describe("User management - in-flight table requests", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);

    // `resetAndSeedDatabase` applies the admin cookie best-effort
    // (`applySessionCookie(...).catch(() => false)`), so a failed application leaves the
    // context anonymous and `/user` silently redirects to `/login` — the test then dies in
    // `goToUserPage` on a URL mismatch, which looks like a UI bug. Verify the session is
    // really usable and repair it once instead.
    // Other projects in the same run talk to the same database: a concurrent
    // `/api/testing {action:"reset"}` wipes the session between seeding and use, so a
    // single repair is not enough. Retry within a bounded window instead of failing on a
    // neighbour's reset.
    let established = await hasAdminSession(page);
    for (let attempt = 0; !established && attempt < 5; attempt++) {
      await resetAndSeedDatabase(page);
      established = await hasAdminSession(page);
      if (!established) await page.waitForTimeout(500);
    }
    if (!established) {
      throw new Error("could not establish a usable admin session after 6 reset+seed attempts");
    }

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

    // The table arrives server-rendered: +page.server.ts loads the first page of users and
    // AdminArea seeds it, so opening the tab issues NO client-side GET /api/user. The race
    // under test is a *re-fetch* landing late, so force one by sorting a column — that is
    // the request the guard has to protect, and the route handler above holds it.
    const sortableHeader = page.getByTestId("user-admin-area").getByRole("columnheader").nth(1);
    await runAfterHydration(page, async () => {
      await sortableHeader.click();
    });

    await Promise.race([
      usersRequestStarted,
      page.waitForTimeout(15_000).then(() => {
        throw new Error(
          "sorting a column issued no GET /api/user — the table never refetched, so the stale-response guard cannot be exercised",
        );
      }),
    ]);

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
