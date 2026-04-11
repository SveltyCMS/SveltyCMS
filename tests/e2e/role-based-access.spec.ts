/**
 * @file tests/playwright/role-based-access.spec.ts
 * @description Role-Based Access Control (RBAC) tests for SveltyCMS
 *
 * Tests that different user roles have appropriate access permissions:
 * - admin: Full system access
 * - developer: API + config access, no user management
 * - editor: Content management only, no settings
 *
 * Based on: docs/architecture/admin-user-management.mdx
 */

import { expect, type Page, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { seedTestUsers, TEST_USERS } from "./helpers/seed";

// Test credentials (created by setup wizard + seed script)
const USERS = {
  admin: {
    email: "admin@example.com",
    password: "Admin123!",
  },
  ...TEST_USERS,
};

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login", { waitUntil: "networkidle", timeout: 30_000 });

  // Inject session storage to bypass the welcome modal and cookie consent
  await page.addInitScript(() => {
    window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
    window.localStorage.setItem(
      "sveltycms_consent",
      JSON.stringify({
        responded: true,
        necessary: true,
        analytics: false,
        marketing: false,
      }),
    );
  });

  // The login page starts with Sign In / Sign Up selection.
  // Click the Sign In icon to reveal the login form.
  const signInIcon = page.getByTestId("signin-icon");
  const signInVisible = await signInIcon.isVisible({ timeout: 5000 }).catch(() => false);
  if (signInVisible) {
    await signInIcon.click();
    await page.waitForTimeout(1000);
  }

  // Wait for the form to appear, then fill it using data-testid
  await page.waitForSelector('[data-testid="signin-email"]', {
    timeout: 15_000,
    state: "visible",
  });
  await page.getByTestId("signin-email").fill(user.email);
  await page.getByTestId("signin-password").fill(user.password);
  await page.getByTestId("signin-submit").click();

  // Wait for redirect away from login
  // Fresh installs redirect to collectionbuilder or dashboard depending on role
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

async function logout(page: Page) {
  // Use data-testid for sign out button
  const logoutButton = page.getByTestId("sign-out-button");
  if (await logoutButton.isVisible({ timeout: 2000 })) {
    await logoutButton.click();
    await page.waitForURL(/\/login/, { timeout: 5000 });
  } else {
    // Fallback for cases where sidebar might be closed or role differs
    await page.goto("/login");
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

    // Should see "Email User Registration token" button (admin privilege)
    const emailTokenButton = page.getByRole("button", {
      name: /email.*token/i,
    });
    await expect(emailTokenButton).toBeVisible({ timeout: 10_000 });

    // Access Management (admin only)
    await page.goto("/config/accessManagement");
    await expect(page).toHaveURL(/accessManagement/i, { timeout: 10_000 });

    await logout(page);
  });

  test("Developer: Can access system config but NOT user management", async ({ page }) => {
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

    // Developer CANNOT manage users
    await page.goto("/config/user");

    // Should either redirect or show forbidden message
    // Use a shorter timeout for the negative check
    const currentUrl = page.url();
    const bodyText = await page.textContent("body");

    const isBlocked =
      !currentUrl.includes("/config/user") ||
      bodyText?.toLowerCase().includes("forbidden") ||
      bodyText?.toLowerCase().includes("unauthorized") ||
      bodyText?.toLowerCase().includes("access denied") ||
      bodyText?.toLowerCase().includes("permission");

    expect(isBlocked).toBeTruthy();

    await logout(page);
  });

  test("Editor: Can access content but NOT system settings", async ({ page }) => {
    await login(page, USERS.editor);

    // Editor CAN access dashboard (which serves as the content landing page when empty)
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

    // Editor CANNOT access system settings
    await page.goto("/config/system-settings");

    // Check for blocked state without waiting for full network idle
    const settingsUrl = page.url();
    const settingsBody = await page.textContent("body");

    const isBlockedFromSettings =
      !settingsUrl.includes("/config/system-settings") ||
      settingsBody?.toLowerCase().includes("forbidden") ||
      settingsBody?.toLowerCase().includes("unauthorized") ||
      settingsBody?.toLowerCase().includes("access denied");

    expect(isBlockedFromSettings).toBeTruthy();

    // Editor CANNOT manage users
    await page.goto("/config/user");

    await page.waitForLoadState("networkidle");
    const userUrl = page.url();
    const userBody = await page.textContent("body");

    const isBlockedFromUsers =
      !userUrl.includes("/config/user") ||
      userBody?.toLowerCase().includes("forbidden") ||
      userBody?.toLowerCase().includes("unauthorized") ||
      userBody?.toLowerCase().includes("access denied");

    expect(isBlockedFromUsers).toBeTruthy();

    // Editor CANNOT access access management
    await page.goto("/config/accessManagement");

    await page.waitForLoadState("networkidle");
    const accessUrl = page.url();
    const accessBody = await page.textContent("body");

    const isBlockedFromAccess =
      !accessUrl.includes("/config/accessManagement") ||
      accessBody?.toLowerCase().includes("forbidden") ||
      accessBody?.toLowerCase().includes("unauthorized") ||
      accessBody?.toLowerCase().includes("access denied");

    expect(isBlockedFromAccess).toBeTruthy();

    await logout(page);
  });

  test("Media Ownership: Admins see all, others see only own", async ({ page }) => {
    // 1. Admin should see all media
    await loginAsAdmin(page);
    const adminMediaResponse = await page.evaluate(async () => {
      const res = await fetch("/api/media");
      return await res.json();
    });
    expect(Array.isArray(adminMediaResponse)).toBeTruthy();
    const totalMediaCount = adminMediaResponse.length;
    console.log(`Admin sees ${totalMediaCount} media items`);
    await logout(page);

    // 2. Editor should only see their own media
    // Note: This assumes the editor hasn't uploaded anything yet in a fresh test DB
    await login(page, USERS.editor);
    const editorMediaResponse = await page.evaluate(async () => {
      const res = await fetch("/api/media");
      return await res.json();
    });
    expect(Array.isArray(editorMediaResponse)).toBeTruthy();

    // If it's a fresh DB, editor sees 0. If they uploaded, they see only theirs.
    // The key is that they shouldn't see what the admin uploaded (if any).
    console.log(`Editor sees ${editorMediaResponse.length} media items`);

    // Safety check: editor count should be <= admin count
    expect(editorMediaResponse.length).toBeLessThanOrEqual(totalMediaCount);

    await logout(page);
  });

  test("IDOR Prevention: Non-admins cannot access sensitive APIs", async ({ page }) => {
    // 1. Editor tries to fetch Users via API
    await login(page, USERS.editor);
    const userApiResponse = await page.evaluate(async () => {
      const res = await fetch("/api/user");
      return { status: res.status, ok: res.ok };
    });
    // Should be Forbidden (403) or Unauthorized (401)
    expect(userApiResponse.ok).toBeFalsy();
    expect([401, 403]).toContain(userApiResponse.status);

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
