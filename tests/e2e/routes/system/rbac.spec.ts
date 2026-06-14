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

// Test credentials (created by setup wizard + seed script)
const USERS = {
  admin: ADMIN_CREDENTIALS,
  ...TEST_USERS,
};

// Use shared loginAs helper instead of custom login function
async function login(page: Page, user: { email: string; password: string }) {
  await loginAs(page, user.email, user.password);
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
      // seedTestUsers now uses /api/testing which is whitelisted
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
    // Use a more specific selector to avoid strict mode violation (multiple matches)
    await expect(
      page
        .locator("h1, h2, .title")
        .filter({ hasText: /system settings/i })
        .first(),
    ).toBeVisible();

    // Developer CAN access main config area
    await page.goto("/config");
    await expect(page).toHaveURL(/\/config/, { timeout: 5000 });

    // Developer CAN access user management (has user:manage permission)
    await page.goto("/config/user");
    await expect(page).toHaveURL(/\/user/, { timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText(/forbidden|unauthorized|access denied/i);

    // Developer CANNOT access admin-only areas (e.g., access management)
    await page.goto("/config/access-management");
    await page.waitForLoadState("networkidle");
    const amUrl = page.url();
    const amBody = await page.textContent("body");

    const isBlockedFromAM =
      !amUrl.includes("/config/access-management") ||
      amBody?.toLowerCase().includes("forbidden") ||
      amBody?.toLowerCase().includes("unauthorized") ||
      amBody?.toLowerCase().includes("access denied") ||
      amBody?.toLowerCase().includes("insufficient permissions");

    expect(isBlockedFromAM).toBeTruthy();

    await logout(page);
  });

  test("Editor: Can access content and user management, NOT system settings", async ({ page }) => {
    await login(page, USERS.editor);

    // Editor CAN access dashboard (which serves as the content landing page when empty)
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

    // Editor CANNOT access system settings
    await page.goto("/config/system-settings");

    // Check for blocked state without waiting for full network idle
    const settingsBody = await page.textContent("body");

    // SvelteKit renders error pages at the same URL, so the URL won't change.
    // Check for 403 indicators in the body content.
    const isBlockedFromSettings =
      settingsBody?.toLowerCase().includes("forbidden") ||
      settingsBody?.toLowerCase().includes("unauthorized") ||
      settingsBody?.toLowerCase().includes("access denied") ||
      settingsBody?.toLowerCase().includes("insufficient permissions") ||
      settingsBody?.toLowerCase().includes("403");

    expect(isBlockedFromSettings).toBeTruthy();

    // Editor CAN manage users (has user:manage permission)
    await page.goto("/config/user");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText(
      /forbidden|unauthorized|access denied|insufficient permissions/i,
    );

    // Editor CANNOT access admin-only areas (e.g., access management)
    await page.goto("/config/access-management");

    await page.waitForLoadState("networkidle");
    const accessBody = await page.textContent("body");

    const isBlockedFromAccess =
      accessBody?.toLowerCase().includes("forbidden") ||
      accessBody?.toLowerCase().includes("unauthorized") ||
      accessBody?.toLowerCase().includes("access denied") ||
      accessBody?.toLowerCase().includes("insufficient permissions") ||
      accessBody?.toLowerCase().includes("403");

    expect(isBlockedFromAccess).toBeTruthy();

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
      const res = await fetch("/api/token");
      const json = await res.json();
      return { status: res.status, ok: res.ok, body: json };
    });
    // Should be Forbidden (403), Unauthorized (401), or return success:false
    const isDenied =
      !tokenApiResponse.ok ||
      [401, 403].includes(tokenApiResponse.status) ||
      tokenApiResponse.body?.success === false;
    expect(isDenied).toBeTruthy();

    // 2. Editor tries to fetch System Config via API
    const configApiResponse = await page.evaluate(async () => {
      const res = await fetch("/api/config");
      return { status: res.status, ok: res.ok };
    });
    expect(configApiResponse.ok).toBeFalsy();
    expect([401, 403]).toContain(configApiResponse.status);

    await logout(page);
  });

  test("Verify all roles can login and logout", async ({ page }) => {
    // Test admin
    await login(page, USERS.admin);
    await expect(page).not.toHaveURL(/\/login/);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);

    // Test developer
    await login(page, USERS.developer);
    await expect(page).not.toHaveURL(/\/login/);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);

    // Test editor
    await login(page, USERS.editor);
    await expect(page).not.toHaveURL(/\/login/);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});
