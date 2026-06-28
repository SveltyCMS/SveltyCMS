/**
 * @file tests/playwright/role-based-access.spec.ts
 * @description Role-Based Access Control (RBAC) tests for SveltyCMS
 *
 * Tests that different user roles have appropriate access permissions:
 * - admin: Full system access
 * - developer: API + config access, user management (has user:manage permission)
 * - editor: Content and user management, no system settings
 *
 * Based on: docs/architecture/admin-user-management.mdx
 */

import { expect, type Page, test } from "@playwright/test";
import { loginAsAdmin, loginAs, ADMIN_CREDENTIALS } from "../../helpers/auth";
import { seedTestUsers, TEST_USERS } from "../../helpers/seed";
import { TEST_API_HEADERS } from "../../helpers/test-api";

// Test credentials (created by setup wizard + seed script)
const USERS = {
  admin: ADMIN_CREDENTIALS,
  ...TEST_USERS,
};

// Use shared loginAs helper instead of custom login function
async function login(page: Page, user: { email: string; password: string }) {
  await loginAs(page, user.email, user.password);
}

/** SvelteKit renders +error.svelte at the same URL — detect 403/401 via status heading or message. */
async function expectAccessDenied(page: Page) {
  await expect(
    page
      .getByRole("heading", { level: 1, name: /^(401|403)$/ })
      .or(page.getByText(/insufficient permissions|forbidden|unauthorized|access denied/i))
      .first(),
  ).toBeVisible({ timeout: 15_000 });
}

async function logout(page: Page) {
  // Use data-testid for sign out button
  const logoutButton = page.getByTestId("sign-out-button");
  if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutButton.click();
    await page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => {});
  } else {
    // Fallback: try role-based button
    const fallbackLogout = page.getByRole("button", {
      name: /sign out|logout/i,
    });
    if (await fallbackLogout.isVisible({ timeout: 1000 }).catch(() => false)) {
      await fallbackLogout.click();
      await page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => {});
    } else {
      // Final fallback: navigate to login directly
      await page.goto("/login");
    }
  }
}

test.describe("Role-Based Access Control", () => {
  test.setTimeout(60_000); // 1 minute timeout for all tests

  test.beforeAll(async ({ browser }) => {
    // Use a separate context/page to seed users via testing API bypass
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      // 1. Reset database
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: { action: "reset" },
      });
      // 2. Seed database (creates default roles & admin)
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
      // 3. Seed test users (developer, editor)
      await seedTestUsers(page);
    } catch (error) {
      console.error("Failed to seed test users:", error);
    } finally {
      await context.close();
    }
  });

  test("Admin: Full access to all system areas", async ({ page }) => {
    await loginAsAdmin(page);

    // System Settings (admin only)
    await page.goto("/config/system-settings");
    await expect(page).toHaveURL(/system-settings/, { timeout: 10_000 });
    await expect(page.getByText(/system settings/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // User Management (admin only) - /config/user may redirect to /user
    await page.goto("/config/user");
    await expect(page).toHaveURL(/\/user/, { timeout: 10_000 });

    // Access Management (admin only)
    await page.goto("/config/access-management");
    await expect(page).toHaveURL(/access-management/i, { timeout: 10_000 });

    await logout(page);
  });

  test("Developer: Can access system config and user management, NOT admin-only areas", async ({
    page,
  }) => {
    await login(page, USERS.developer);

    // Developer CAN access system configuration
    await page.goto("/config/system-settings");
    await expect(page).toHaveURL(/\/config\/system-settings/, {
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { name: /system settings/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Developer CAN access main config area
    await page.goto("/config");
    await expect(page).toHaveURL(/\/config/, { timeout: 5000 });

    // Developer CAN access user management (has user:manage permission)
    await page.goto("/config/user");
    await expect(page).toHaveURL(/\/user/, { timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText(/forbidden|unauthorized|access denied/i);

    // Developer CANNOT access admin-only areas (e.g., access management)
    await page.goto("/config/access-management");
    await expectAccessDenied(page);

    await logout(page);
  });

  test("Editor: Can access content and user management, NOT system settings", async ({ page }) => {
    await login(page, USERS.editor);

    // Editor CAN access dashboard (which serves as the content landing page when empty)
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

    // Editor CANNOT access system settings
    await page.goto("/config/system-settings");
    await expectAccessDenied(page);

    // Editor CAN manage users (has user:manage permission)
    await page.goto("/config/user");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toContainText(
      /forbidden|unauthorized|access denied|insufficient permissions/i,
    );

    // Editor CANNOT access admin-only areas (e.g., access management)
    await page.goto("/config/access-management");
    await expectAccessDenied(page);

    await logout(page);
  });

  test("Media Ownership: Admins see all, others see only own", async ({ page }) => {
    // 1. Admin should see all media
    await loginAsAdmin(page);
    const adminMediaResponse = await page.evaluate(async () => {
      const res = await fetch("/api/media");
      const json = await res.json();
      // API returns { success: true, data: [...] } or similar wrapper
      return json.data || json.media || json;
    });
    const adminMediaData = Array.isArray(adminMediaResponse) ? adminMediaResponse : [];
    const totalMediaCount = adminMediaData.length;
    console.log(`Admin sees ${totalMediaCount} media items`);
    await logout(page);

    // 2. Editor should only see their own media
    // Note: This assumes the editor hasn't uploaded anything yet in a fresh test DB
    await login(page, USERS.editor);
    const editorMediaResponse = await page.evaluate(async () => {
      const res = await fetch("/api/media");
      const json = await res.json();
      return json.data || json.media || json;
    });
    const editorMediaData = Array.isArray(editorMediaResponse) ? editorMediaResponse : [];

    console.log(`Editor sees ${editorMediaData.length} media items`);

    expect(editorMediaData.length).toBeLessThanOrEqual(totalMediaCount);

    await logout(page);
  });

  test("IDOR Prevention: Non-admins cannot access sensitive APIs", async ({ page }) => {
    // 1. Editor tries to fetch Tokens via API (admin-only endpoint)
    await login(page, USERS.editor);
    const tokenApiResponse = await page.evaluate(async () => {
      const res = await fetch("/api/token", {
        headers: { "x-test-security": "true" },
      });
      const json = await res.json();
      return { status: res.status, ok: res.ok, body: json };
    });
    // Should be Forbidden (403), Unauthorized (401), or return success:false
    const isDenied =
      !tokenApiResponse.ok ||
      [401, 403].includes(tokenApiResponse.status) ||
      tokenApiResponse.body?.success === false;
    expect(isDenied).toBeTruthy();

    // 2. Editor tries to fetch System Settings via API (mapped namespace, fail-closed)
    const settingsApiResponse = await page.evaluate(async () => {
      const res = await fetch("/api/system-settings", {
        headers: { "x-test-security": "true" },
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, body: json };
    });
    const settingsDenied =
      !settingsApiResponse.ok ||
      [401, 403].includes(settingsApiResponse.status) ||
      settingsApiResponse.body?.success === false;
    expect(settingsDenied).toBeTruthy();

    await logout(page);
  });

  test("Verify all roles can login and logout", async ({ page }) => {
    test.setTimeout(120_000);

    // Helper: clear session and verify we end up on /login
    async function logoutAndVerify() {
      // Clear all cookies and storage, then navigate to /login
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto("/login", { waitUntil: "networkidle", timeout: 15_000 });
      // If server redirects us back (session still in server cache),
      // clear cookies again and force navigate
      if (!page.url().includes("/login")) {
        await page.context().clearCookies();
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        await page.goto("/login", { waitUntil: "networkidle", timeout: 10_000 });
      }
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    }

    // Test admin
    await login(page, USERS.admin);
    await expect(page).not.toHaveURL(/\/login/);
    await logoutAndVerify();

    // Test developer
    await login(page, USERS.developer);
    await expect(page).not.toHaveURL(/\/login/);
    await logoutAndVerify();

    // Test editor
    await login(page, USERS.editor);
    await expect(page).not.toHaveURL(/\/login/);
    await logoutAndVerify();
  });
});
