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
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
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
        "[Auth] WARNING: Only SIGN UP icon visible. DB might not be seeded or isFirstUser=true.",
      );
      // In first user mode, we'll try to click signup and fill it, but expect error later
      await signUpIcon.click({ force: true });
      await page.waitForTimeout(1000);
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

      // Check if signup form is showing (first-user mode / no users in DB)
      const confirmPassword = page.locator('input[name="confirm_password"]');
      if (await confirmPassword.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log("[Auth] Signup form detected (first-user mode). Auto-seeding admin user...");
        try {
          await page.request.post("/api/testing", {
            headers: TEST_API_HEADERS,
            data: {
              action: "seed",
              email: ADMIN_CREDENTIALS.email,
              password: ADMIN_CREDENTIALS.password,
            },
          });
          console.log("[Auth] ✓ Admin user seeded, reloading and retrying...");
        } catch (seedError) {
          console.log("[Auth] Seed failed, trying reset first...", seedError);
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

        // Reload and re-click SIGN IN
        await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(500);

        const signInIconRetry = page.getByTestId("signin-icon");
        if (await signInIconRetry.isVisible({ timeout: 5000 }).catch(() => false)) {
          await signInIconRetry.click({ force: true, timeout: 10000 });
          await page.waitForTimeout(1000);
        }

        // Retry finding the signin-email field
        await page.getByTestId("signin-email").waitFor({ state: "visible", timeout: 15_000 });
        console.log("[Auth] ✓ Login form ready after auto-seeding");
        return;
      }

      throw e;
    });
}

/**
 * Generic login function for any user with retry + auto-seed on failure.
 * If login fails (still on /login after submit), seeds the admin user via
 * the testing API and retries once. This handles cases where a previous test
 * modified/renamed the admin user.
 *
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
  // --- First attempt ---
  let loginSuccess = await attemptLogin(page, email, password, waitForUrl);

  if (!loginSuccess) {
    // Admin user may have been modified by a previous test — seed and retry.
    console.log("[Auth] Login failed — seeding admin user via testing API and retrying...");
    try {
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: email,
          password: password,
        },
      });
      console.log("[Auth] ✓ Admin user re-seeded, retrying login...");
    } catch (seedError) {
      console.log("[Auth] Seeding failed, trying reset + seed...", seedError);
      try {
        await page.request.post("/api/testing", {
          headers: TEST_API_HEADERS,
          data: { action: "reset" },
        });
        await page.request.post("/api/testing", {
          headers: TEST_API_HEADERS,
          data: {
            action: "seed",
            email: email,
            password: password,
          },
        });
        console.log("[Auth] ✓ Database reset and re-seeded");
      } catch (resetError) {
        console.log("[Auth] Reset+seed also failed:", resetError);
      }
    }

    // --- Second attempt: full prepareLoginForm cycle ---
    loginSuccess = await attemptLogin(page, email, password, waitForUrl);
  }

  if (!loginSuccess) {
    throw new Error(
      `Login failed for ${email} after retry with seeding. Current URL: ${page.url()}`,
    );
  }
}

/**
 * Internal: attempt a single login and return whether it succeeded.
 * Always calls prepareLoginForm for a clean state before filling.
 */
async function attemptLogin(
  page: Page,
  email: string,
  password: string,
  waitForUrl?: string | RegExp,
): Promise<boolean> {
  try {
    await prepareLoginForm(page);
  } catch (e) {
    console.log("[Auth] prepareLoginForm failed:", e);
    return false;
  }

  // Fill login form using data-testid selectors
  console.log(`[Auth] Filling email: ${email}`);
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(password);

  // Submit form using data-testid
  console.log("[Auth] Submitting login form...");
  await page.getByTestId("signin-submit").click();

  // Wait for redirect away from /login
  try {
    if (waitForUrl) {
      await page.waitForURL(waitForUrl, { timeout: 10_000 });
    } else {
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    }
    console.log("[Auth] ✓ Login successful");
    return true;
  } catch {
    console.log(`[Auth] Login attempt failed — still on ${page.url()}`);
    return false;
  }
}

/** True when page.request can call a protected API with the current cookie jar. */
async function adminSessionLooksValid(page: Page): Promise<boolean> {
  try {
    // /api/user/me returns the current user; /api/user is a list endpoint (needs user:read)
    const res = await page.request.get("/api/user/me", {
      headers: { Accept: "application/json" },
    });
    if (res.status() === 401 || res.status() === 403) return false;
    return res.ok();
  } catch {
    return false;
  }
}

/** Best-effort inject Set-Cookie / x-test-session-id into browser context. */
async function injectSessionCookieFromResponse(
  page: Page,
  loginRes: {
    headers: () => Record<string, string>;
    url: () => string;
    json?: () => Promise<any>;
  },
  bodyToken?: string,
): Promise<void> {
  try {
    const headers = loginRes.headers();
    const setCookie = headers["set-cookie"] || "";
    let sid = headers["x-test-session-id"] || bodyToken || "";
    if (!sid && loginRes.json) {
      try {
        const body = await loginRes.json();
        sid = body?.token || "";
      } catch {
        /* ignore */
      }
    }
    const nv = setCookie.split(";")[0] || "";
    const eq = nv.indexOf("=");
    let host = "127.0.0.1:4173";
    try {
      host = new URL(loginRes.url()).host;
    } catch {
      /* keep default */
    }

    let name = eq > 0 ? nv.slice(0, eq).trim() : "";
    let value = eq > 0 ? nv.slice(eq + 1).trim() : "";
    // Prefer Set-Cookie name/value; fall back to plain auth_sessions + session id
    if (!name) name = "auth_sessions";
    if (!value) value = sid;
    if (!value) return;

    // Force plain cookie over HTTP — browsers drop Secure/__Host- cookies on http://
    if (name.startsWith("__Host-") || name.startsWith("__Secure-")) {
      name = "auth_sessions";
    }

    await page.context().addCookies([
      {
        name,
        value: value || sid,
        url: `http://${host}`,
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ]);
  } catch (err) {
    console.log("[Auth] cookie inject skipped:", err);
  }
}

/**
 * Login as a non-admin test user (editor by default) via testing API when possible.
 * Always clears prior admin storageState so role-gated UI is honest.
 */
export async function loginAsEditor(
  page: Page,
  waitForUrl?: string | RegExp,
  credentials: { email: string; password: string } = {
    email: "editor@example.com",
    password: "Editor123!",
  },
) {
  await page.context().clearCookies();
  await page
    .evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    })
    .catch(() => {});

  try {
    let loginRes = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "login", email: credentials.email, password: credentials.password },
    });
    if (!loginRes.ok()) {
      // Ensure user exists then retry
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "prepare-test-user",
          email: credentials.email,
          password: credentials.password,
          role: "editor",
          username: "Editor",
        },
      });
      loginRes = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: { action: "login", email: credentials.email, password: credentials.password },
      });
    }
    if (loginRes.ok()) {
      const target = typeof waitForUrl === "string" ? waitForUrl : "/user";
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (!page.url().includes("/login")) {
        return;
      }
    }
  } catch {
    /* fall through to UI login */
  }

  await loginAs(page, credentials.email, credentials.password, waitForUrl);
}

/**
 * Login as admin user (uses default ADMIN_CREDENTIALS).
 * Prefers testing-API seed+login (Set-Cookie into page.request jar) so chromium
 * shards do not depend on UI form + remote CSRF + collectionbuilder redirects.
 * Falls back to UI loginAs if the testing API is unavailable.
 *
 * Never treats public "/" as an auth probe — use /api/user/me + protected /user.
 */
export async function loginAsAdmin(page: Page, waitForUrl?: string | RegExp) {
  const email = ADMIN_CREDENTIALS.email;
  const password = ADMIN_CREDENTIALS.password;

  // CRITICAL: never treat public "/" as an auth probe — it does not redirect to
  // /login when unauthenticated, which previously false-positived storageState
  // ("Existing session still valid") while protected routes still bounced to login.
  try {
    if (await adminSessionLooksValid(page)) {
      console.log("[Auth] ✓ Existing session valid (/api/user/me)");
      if (typeof waitForUrl === "string") {
        await page.goto(waitForUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
        if (!page.url().includes("/login")) return;
      } else if (waitForUrl instanceof RegExp) {
        // Land on a protected page first so waitForURL has a chance to match
        await page
          .goto("/user", { waitUntil: "domcontentloaded", timeout: 20_000 })
          .catch(() => undefined);
        await page.waitForURL(waitForUrl, { timeout: 10_000 }).catch(() => undefined);
        if (!page.url().includes("/login")) return;
      } else {
        return;
      }
      // Session API ok but document request bounced — re-login below
      console.log("[Auth] API session ok but document bounced to login — re-auth");
    }

    // Mint session via testing API (seed only if admin missing; never wipe users)
    let loginRes = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "login", email, password },
    });
    if (!loginRes.ok()) {
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: { action: "seed", email, password },
      });
      loginRes = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: { action: "login", email, password },
      });
    }

    if (loginRes.ok()) {
      let bodyToken = "";
      try {
        const body = await loginRes.json();
        bodyToken = body?.token || "";
      } catch {
        /* ignore */
      }
      await injectSessionCookieFromResponse(page, loginRes, bodyToken);
      console.log("[Auth] ✓ Admin session via testing API");

      // Verify on a protected route — must NOT bounce to /login
      const verifyPath = typeof waitForUrl === "string" ? waitForUrl : "/user";
      await page.goto(verifyPath, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (!page.url().includes("/login") && !page.url().includes("/setup")) {
        if (waitForUrl instanceof RegExp) {
          await page.waitForURL(waitForUrl, { timeout: 10_000 }).catch(() => undefined);
        }
        return;
      }
      console.log(
        `[Auth] API session did not stick (landed on ${page.url()}) — falling back to UI login`,
      );
    } else {
      console.log(
        `[Auth] testing API login status=${loginRes.status()} — falling back to UI login`,
      );
    }
  } catch (err) {
    console.log("[Auth] testing API login failed — falling back to UI login:", err);
  }

  await loginAs(page, email, password, waitForUrl);
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
