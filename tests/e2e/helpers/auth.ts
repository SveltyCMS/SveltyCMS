/**
 * @file tests/playwright/helpers/auth.ts
 * @description Shared authentication helper for Playwright tests
 * Uses the same credentials as setup-wizard to ensure consistency
 */

import { expect, type Page } from "@playwright/test";
import { TEST_API_HEADERS } from "./test-api";

/**
 * Login credentials that match the setup wizard defaults
 */
export const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || "admin@example.com",
  password: process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || "Password123!",
};

/**
 * Prepare the login form by dismissing modals and clicking the sign in icon
 * @param page - Playwright page object
 */
export async function prepareLoginForm(page: Page) {
  // Atomic Auth: Clear all previous session state to prevent session bleed
  console.log(`[Auth] Preparing login form...`);
  await page.context().clearCookies();

  // Navigate first to ensure we have a valid origin for localStorage access
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Now safe to clear storage (we're on the domain)
  await page
    .evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    })
    .catch(() => {
      // Ignore errors if localStorage is restricted
      console.log("[Auth] Could not clear storage (might be restricted)");
    });

  // Inject storage to bypass ALL modals (welcome, cookie consent, first login)
  await page.addInitScript(() => {
    // Setup wizard welcome modal
    window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");

    // Cookie consent
    window.localStorage.setItem(
      "sveltycms_consent",
      JSON.stringify({ responded: true, necessary: true }),
    );

    // First login welcome for admin
    window.localStorage.setItem("sveltycms-welcome-seen", "true");
    window.localStorage.setItem(
      "sveltycms-welcome-progress",
      JSON.stringify(["data-management", "collections", "users", "settings"]),
    );
  });

  // Navigate to login page (reload to apply init scripts)
  console.log("[Auth] Navigating to /login...");
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(500);

  // Check if we got redirected to setup (config incomplete)
  if (page.url().includes("/setup")) {
    throw new Error(`Setup is not complete. Cannot login - redirected to: ${page.url()}`);
  }

  // CRITICAL: Dismiss ALL blocking modals that might interfere with login
  console.log("[Auth] Checking for blocking modals...");

  // Strategy 1: Database Error Modal (HIGHEST PRIORITY - completely blocks login)
  // Check for the exact error modal structure from error-context.md
  const dbErrorHeading = page.locator(
    'h2:has-text("Database Connection Error"), h2:has-text("Database Error")',
  );
  if (await dbErrorHeading.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("[Auth] ⚠️ Database Error Modal detected! Database empty - auto-seeding...");

    // CRITICAL FIX: Seed database via Testing API when empty
    try {
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
      console.log("[Auth] ✓ Database seeded successfully");
    } catch (seedError) {
      console.log("[Auth] ⚠️ Seeding failed, trying reset first...", seedError);
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: { action: "reset" },
      });
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
      console.log("[Auth] ✓ Database reset and seeded");
    }

    // Reload login page with seeded database
    await page.goto("/login", { waitUntil: "networkidle", timeout: 100000 });
    await page.waitForTimeout(1000);
  }

  // Strategy 2: First Login Welcome Modal
  const welcomeModal = page.locator('div.fixed.inset-0.z-50:has-text("Welcome")').first();
  if (await welcomeModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log("[Auth] First Login Welcome Modal detected, dismissing...");
    const skipBtn = page
      .locator('button:has-text("Skip"), button:has-text("Close"), button:has-text("Get Started")')
      .first();
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Strategy 3: General modal dismissal (any other blocking modals)
  const genericModal = page.locator("div.fixed.inset-0.z-50").first();
  if (await genericModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log("[Auth] Generic modal detected, attempting to dismiss...");
    const anyCloseBtn = page
      .locator(
        'button:has-text("Close"), button:has-text("OK"), button:has-text("Accept"), [aria-label*="close" i]',
      )
      .first();
    if (await anyCloseBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await anyCloseBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Strategy 4: Cookie consent banner (defense-in-depth fallback)
  // The addInitScript above should prevent this, but dismiss if still visible
  const cookieAcceptBtn = page.getByTestId("cookie-accept-all");
  if (await cookieAcceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("[Auth] Cookie consent still visible despite init script, accepting...");
    await cookieAcceptBtn.click();
    await page.waitForTimeout(300);
    console.log("[Auth] ✓ Cookie consent accepted");
  }

  console.log("[Auth] Modal dismissal complete.");

  // Check if we're on the login selection page (SIGN IN / SIGN UP buttons)
  // Try data-testid first, then fallback to previous locators
  const signInIcon = page.getByTestId("signin-icon");
  const signInButton = page
    .locator('div[role="button"]:has-text("SIGN IN"), p:has-text("Sign In")')
    .first();

  const signInIconVisible = await signInIcon.isVisible({ timeout: 2000 }).catch(() => false);
  const signInButtonVisible =
    !signInIconVisible && (await signInButton.isVisible({ timeout: 2000 }).catch(() => false));

  if (signInIconVisible) {
    console.log("[Auth] Clicking SIGN IN icon...");
    // Use force click with retry to bypass any transient overlays
    await signInIcon.click({ force: true, timeout: 10000 });
    await page.waitForTimeout(1000);
  } else if (signInButtonVisible) {
    console.log("[Auth] Clicking SIGN IN button (fallback)...");
    await signInButton.click({ force: true, timeout: 10000 });
    await page.waitForTimeout(1000);
  } else {
    // If neither is visible, we might already be on the form, or on the SIGN UP only page (First User)
    const signUpIcon = page.getByTestId("signup-icon");
    if (await signUpIcon.isVisible()) {
      console.log(
        "[Auth] WARNING: Only SIGN UP icon visible. Seeding admin once and retrying sign in.",
      );
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
      await page.context().clearCookies();
      await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
      const retrySignInIcon = page.getByTestId("signin-icon");
      await retrySignInIcon.click({ force: true, timeout: 10_000 });
      await page.waitForTimeout(1000);
    }
  }

  if (
    !(await page
      .getByTestId("signin-email")
      .isVisible({ timeout: 2_000 })
      .catch(() => false))
  ) {
    const goBack = page.getByRole("button", { name: /go back/i }).first();
    if (await goBack.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await goBack.click({ force: true });
      await page.waitForTimeout(300);
    }

    const signInChooser = page.getByRole("button", { name: /go to sign in|sign in/i }).first();
    if (await signInChooser.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await signInChooser.click({ force: true, timeout: 5_000 });
      await page.waitForTimeout(500);
    }
  }

  // Wait for login form to be visible - use data-testid
  console.log("[Auth] Waiting for signin-email field...");
  await page
    .getByTestId("signin-email")
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(async (e) => {
      console.error("[Auth] ERROR: signin-email field not found!");
      // Provide debug info about available inputs
      const inputs = await page.locator("input").all();
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const name = await input.getAttribute("name");
        const testId = await input.getAttribute("data-testid");
        console.error(`[Auth]   Input ${i}: name=${name}, data-testid=${testId}`);
      }
      throw e;
    });
}

/**
 * Generic login function for any user
 * @param page - Playwright page object
 * @param email - User email
 * @param password - User password
 * @param waitForUrl - URL pattern to wait for after login (default: not /login)
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
  waitForUrl?: string | RegExp,
) {
  await prepareLoginForm(page);

  // Fill login form using data-testid selectors
  console.log(`[Auth] Filling email: ${email}`);
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(password);

  // Submit form using data-testid
  console.log("[Auth] Submitting login form...");
  await page.getByTestId("signin-submit").click();

  if (waitForUrl) {
    await page.waitForURL(waitForUrl, { timeout: 15_000 });
  } else {
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  }
}

/**
 * Login as admin user (uses default ADMIN_CREDENTIALS)
 * @param page - Playwright page object
 * @param waitForUrl - URL pattern to wait for after login (default: Collections/Names page)
 */
export async function loginAsAdmin(page: Page, waitForUrl?: string | RegExp) {
  await loginAs(page, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password, waitForUrl);
}

/**
 * Enable 2FA for a specific user to test the 2FA UI flow
 * @param page - Playwright page object
 * @param email - User email
 */
export async function enable2FAForTestUser(page: Page, email: string) {
  // 1. Get user to find ID
  const userRes = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "get-user", email },
  });
  const userData = await userRes.json();
  if (!userData.success || !userData.user) {
    throw new Error(`Failed to find user ${email}`);
  }

  // 2. Update user to enable 2FA
  const updateRes = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "update",
      collectionId: "auth_users",
      id: userData.user._id,
      data: { is2FAEnabled: true },
    },
  });
  const updateData = await updateRes.json();
  if (!updateData.success) {
    throw new Error(`Failed to enable 2FA for user ${email}`);
  }
}

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

    // Navigate to login to confirm logout
    await page.goto("/login", {
      timeout: 10_000,
      waitUntil: "domcontentloaded",
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
