/**
 * @file tests/playwright/helpers/auth.ts
 * @description Shared authentication helper for Playwright tests
 * Uses the same credentials as setup-wizard to ensure consistency
 */

import { expect, type Page } from "@playwright/test";

/**
 * Login credentials that match the setup wizard defaults
 */
export const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || "admin@example.com",
  password: process.env.ADMIN_PASS || "Admin123!",
};

export async function loginAs(
  page: Page,
  arg2?: { email: string; password: string } | string | RegExp,
  arg3?: string | RegExp,
) {
  let credentials = ADMIN_CREDENTIALS;
  let waitForUrl: string | RegExp | undefined = undefined;

  if (typeof arg2 === "string" || arg2 instanceof RegExp) {
    waitForUrl = arg2;
  } else if (arg2) {
    credentials = arg2;
    waitForUrl = arg3;
  }

  // Atomic Auth: Clear previous state
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // Inject session storage to bypass welcome modal
  await page.addInitScript(() => {
    window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");
    window.localStorage.setItem(
      "sveltycms_consent",
      JSON.stringify({ responded: true, necessary: true }),
    );
  });

  await page.goto("/login", { waitUntil: "networkidle" });

  // Handle SignIn icon if visible
  const signInIcon = page.getByTestId("signin-icon");
  if (await signInIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
    await signInIcon.click();
  }

  // Fill form
  await page.getByTestId("signin-email").fill(credentials.email);
  await page.getByTestId("signin-password").fill(credentials.password);
  await page.getByTestId("signin-submit").click();

  if (waitForUrl) {
    await page.waitForURL(waitForUrl, { timeout: 15_000 });
  } else {
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  }
}

/**
 * Backward compatibility alias
 */
export const loginAsAdmin = loginAs;

/**
 * Logout current user
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
  try {
    // Try to navigate to home/dashboard first to check if logged in
    await page.goto("/", { timeout: 10_000, waitUntil: "domcontentloaded" });

    // If we're on setup or login page, we're not logged in
    if (page.url().includes("/setup") || page.url().includes("/login")) {
      console.log("[Auth] Not logged in, skipping logout");
      return;
    }

    // Look for logout button or menu - try multiple selectors
    const logoutSelectors = [
      '[data-testid="sign-out-button"]',
      'button:has-text("Logout")',
      'button:has-text("Sign out")',
      'button:has-text("Log out")',
      'a:has-text("Logout")',
      'a:has-text("Sign out")',
      '[aria-label*="logout" i]',
      '[aria-label*="sign out" i]',
    ];

    for (const selector of logoutSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`[Auth] Logging out using selector: ${selector}`);
        await button.click();
        await page.waitForURL(/\/(login|signup)/, { timeout: 5000 }).catch(() => {});
        return;
      }
    }

    console.log("[Auth] No logout button found, clearing cookies and localStorage");
    // If no logout button found, clear session manually
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch (error) {
    console.log("[Auth] Error during logout, continuing anyway:", error);
  }
}

/**
 * Ensure sidebar is visible on mobile viewports
 * On mobile (<768px), the sidebar is hidden by default
 * @param page - Playwright page object
 */
export async function ensureSidebarVisible(page: Page) {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;

  if (isMobile) {
    // Try to find and click the menu/hamburger button to open sidebar
    const menuButton = page
      .locator(
        'button[aria-label*="menu" i], button[aria-label*="sidebar" i], button[aria-label="Open Sidebar"]',
      )
      .first();
    const menuVisible = await menuButton.isVisible().catch(() => false);

    if (menuVisible) {
      await menuButton.click();
      await page.waitForTimeout(500);
      console.log("✓ Opened sidebar on mobile viewport");
      return true;
    }
  }
  return false;
}
