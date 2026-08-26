/**
 * @file tests/e2e/helpers/auth.ts
 * @description Canonical authentication helper for Playwright E2E tests.
 *
 * Single entry for admin login. Credentials come from `@tests/harness`
 * (same universe as integration seed / CI). Session cookie injection lives
 * in `test-auth.ts` — import `applySessionCookie` / `ensureAuthenticated`
 * from there when you need low-level API session attach.
 */

import { expect, type Page } from "@playwright/test";
// Relative import: Playwright does not resolve @tests aliases.
import {
  ADMIN_CREDENTIALS as HARNESS_ADMIN,
  EDITOR_CREDENTIALS as HARNESS_EDITOR,
  TEST_PASSWORD,
} from "../../harness/fixtures";
import { SESSION_COOKIE_RE, sessionLooksValid, TEST_API_HEADERS } from "./api";
import { dismissCookieConsent } from "./cookie-consent";

/**
 * Login credentials — harness is source of truth; env can override in CI.
 */
export const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || HARNESS_ADMIN.email,
  password: process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || HARNESS_ADMIN.password,
};

/** Editor role credentials (RBAC E2E). */
export const EDITOR_CREDENTIALS = {
  email: process.env.EDITOR_EMAIL || HARNESS_EDITOR.email,
  password: process.env.EDITOR_PASSWORD || HARNESS_EDITOR.password,
};

export { TEST_PASSWORD };

/**
 * Prepare the login form by dismissing modals and clicking the sign in icon
 * @param page - Playwright page object
 */
export async function prepareLoginForm(page: Page) {
  // Atomic Auth: Clear all previous session state to prevent session bleed
  console.log(`[Auth] Preparing login form...`);
  await page.context().clearCookies();

  // Inject storage script to clear old auth tokens BEFORE navigation mounts
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {}
    // Setup wizard welcome modal
    window.sessionStorage.setItem("sveltycms_welcome_modal_shown", "true");

    // Cookie consent (full shape so GDPR banner never mounts)
    window.localStorage.setItem(
      "sveltycms_consent",
      JSON.stringify({
        responded: true,
        necessary: true,
        analytics: false,
        marketing: false,
      }),
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
  // Prefer network-idle-ish settle via URL stability over fixed sleep
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

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

    // Reload login page with seeded database and wait for the chooser/form to render
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page
      .getByTestId("signin-icon")
      .or(page.getByTestId("signup-icon"))
      .or(page.getByTestId("signin-email"))
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => undefined);
  }

  // Strategy 2: First Login Welcome Modal — use role-based, not CSS classes
  const welcomeModal = page
    .getByRole("dialog")
    .filter({ hasText: /welcome/i })
    .first();
  if (await welcomeModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log("[Auth] First Login Welcome Modal detected, dismissing...");
    const skipBtn = welcomeModal.getByRole("button", { name: /skip|close|get started/i }).first();
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
      await welcomeModal.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
    }
  }

  // Strategy 3: General modal dismissal — role-based, no CSS classes
  const genericModal = page
    .getByRole("dialog")
    .filter({ hasNotText: /cookie|privacy|welcome/i })
    .first();
  if (await genericModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log("[Auth] Generic modal detected, attempting to dismiss...");
    const anyCloseBtn = page
      .locator(
        'button:has-text("Close"), button:has-text("OK"), button:has-text("Accept"), [aria-label*="close" i]',
      )
      .first();
    if (await anyCloseBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await anyCloseBtn.click();
      await genericModal.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
    }
  }

  // Strategy 4: Cookie consent banner (defense-in-depth fallback)
  // The addInitScript above should prevent this, but dismiss if still visible
  const cookieAcceptBtn = page.getByTestId("cookie-accept-all");
  if (await cookieAcceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("[Auth] Cookie consent still visible despite init script, accepting...");
    await cookieAcceptBtn.click();
    await cookieAcceptBtn.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
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
    // Use force click with retry to bypass any transient overlays.
    // No fixed sleep: the signin-email waitFor below is the readiness gate.
    await signInIcon.click({ force: true, timeout: 10000 });
  } else if (signInButtonVisible) {
    console.log("[Auth] Clicking SIGN IN button (fallback)...");
    await signInButton.click({ force: true, timeout: 10000 });
  } else {
    // If neither is visible, we might already be on the form, or on the SIGN UP only page (First User)
    const signUpIcon = page.getByTestId("signup-icon");
    if (await signUpIcon.isVisible()) {
      console.log(
        "[Auth] WARNING: Only SIGN UP icon visible. DB might not be seeded or isFirstUser=true.",
      );
      // In first user mode, we'll try to click signup and fill it, but expect error later
      await signUpIcon.click({ force: true });
    }
  }

  // Wait for login form or detect first-user signup form
  console.log("[Auth] Waiting for signin-email field...");
  const signinField = page.getByTestId("signin-email");
  const confirmPassword = page.locator('input[name="confirm_password"]');
  const signUpIconEl = page.getByTestId("signup-icon");

  // Fast check: if signup form or only signup icon is showing, seed immediately without waiting 15s
  const isSignupShowing = await confirmPassword.isVisible({ timeout: 1000 }).catch(() => false);
  const isSignupIconOnly =
    !signInIconVisible && (await signUpIconEl.isVisible({ timeout: 1000 }).catch(() => false));

  if (!isSignupShowing && !isSignupIconOnly) {
    // Try waiting for signin-email with 4s timeout (so fallback seeds quickly if DB unseeded)
    await signinField.waitFor({ state: "visible", timeout: 4_000 }).catch(() => {
      console.log(
        "[Auth] signin-email not visible within 4s, checking for auto-seeding fallback...",
      );
    });
  }

  if (!(await signinField.isVisible().catch(() => false))) {
    console.log("[Auth] Signup form / unseeded DB detected. Auto-seeding admin user...");
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

    // Reload and re-click SIGN IN — wait for the chooser instead of a fixed sleep.
    // The post-reset adapter swap is transient: a seed can land before the new
    // adapter's tables are fully re-provisioned (signup view persists). Retry
    // seed + reload a bounded number of times instead of failing on the first.
    let seededRetries = 0;
    while (seededRetries < 3) {
      seededRetries++;
      await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page
        .getByTestId("signin-icon")
        .or(page.getByTestId("signup-icon"))
        .or(page.getByTestId("signin-email"))
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => undefined);

      const signInIconRetry = page.getByTestId("signin-icon");
      if (await signInIconRetry.isVisible({ timeout: 5000 }).catch(() => false)) {
        await signInIconRetry.click({ force: true, timeout: 10000 });
        // Let the form transition settle before checking for the email field.
        // CI runners can be slow to render the animated form swap.
        await page.waitForTimeout(500);
      }

      const retryField = page.getByTestId("signin-email");
      if (await retryField.isVisible({ timeout: 10_000 }).catch(() => false)) {
        console.log("[Auth] ✓ Login form ready after auto-seeding");
        return;
      }

      // Still in first-user mode — re-seed (idempotent) and loop.
      await page.request
        .post("/api/testing", {
          headers: TEST_API_HEADERS,
          data: {
            action: "seed",
            email: ADMIN_CREDENTIALS.email,
            password: ADMIN_CREDENTIALS.password,
          },
        })
        .catch(() => {});
    }

    // Final attempt: hard gate so the failure surface is the form itself.
    await page.getByTestId("signin-email").waitFor({ state: "visible", timeout: 15_000 });
    console.log("[Auth] ✓ Login form ready after auto-seeding");
    return;
  }
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
    console.log(`[Auth] Form login failed for ${email} — attempting API login fallback...`);
    try {
      const apiRes = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: { action: "login", email, password },
      });
      if (apiRes.ok()) {
        const body = await apiRes.json();
        if (body.success && body.token) {
          const urlObj = new URL(
            page.url().startsWith("http") ? page.url() : "http://localhost:5173",
          );
          await page.context().addCookies([
            {
              name: "auth_sessions",
              value: body.token,
              domain: urlObj.hostname,
              path: "/",
              httpOnly: true,
              sameSite: "Lax",
            },
          ]);
          await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 15_000 });
          loginSuccess = true;
          console.log(`[Auth] ✓ API login fallback succeeded for ${email}`);
        }
      }
    } catch (apiErr) {
      console.log(`[Auth] API login fallback error: ${apiErr}`);
    }
  }

  if (!loginSuccess) {
    // Admin user may have been modified or locked by a previous test — re-seed to reset.
    console.log("[Auth] Login failed — re-seeding admin user via testing API...");
    try {
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: email,
          password: password,
        },
      });
      console.log("[Auth] ✓ Admin user re-seeded (password + lockout reset), retrying login...");
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

    // --- Final attempt: full prepareLoginForm cycle ---
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

  // Ensure Sign In form tab is selected if signin-icon is present
  // (no fixed sleep — fill() below auto-waits for the form fields)
  const signInIcon = page.getByTestId("signin-icon");
  if (await signInIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("[Auth] Switching to Sign In tab...");
    await signInIcon.click({ force: true }).catch(() => {});
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

/**
 * Login as a non-admin test user (editor by default) via testing API when possible.
 * Always clears prior admin storageState so role-gated UI is honest.
 */
export async function loginAsEditor(
  page: Page,
  waitForUrl?: string | RegExp,
  credentials: { email: string; password: string } = {
    email: HARNESS_EDITOR.email,
    password: HARNESS_EDITOR.password,
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
 * Session validation is API-based (GET /api/user), NOT a full page load:
 * the previous implementation navigated to /config/collectionbuilder and probed
 * shell testids — ~1-3s per call and coupled to that route's render health.
 */
export async function loginAsAdmin(page: Page, waitForUrl?: string | RegExp) {
  const email = ADMIN_CREDENTIALS.email;
  const password = ADMIN_CREDENTIALS.password;

  // Intercept cross-origin icon CDN requests to strip Playwright's test headers
  // that cause CORS failures. Applies to all icon CDNs used by iconify-icon.
  await page.route("https://api.iconify.design/**", async (route) => {
    try {
      const response = await route.fetch();
      await route.fulfill({ response });
    } catch {
      // Test may have ended before icon fetch completed — ignore silently
    }
  });
  await page.route("https://api.unisvg.com/**", async (route) => {
    try {
      const response = await route.fetch();
      await route.fulfill({ response });
    } catch {
      // Test may have ended before icon fetch completed — ignore silently
    }
  });
  await page.route("https://api.simplesvg.com/**", async (route) => {
    try {
      const response = await route.fetch();
      await route.fulfill({ response });
    } catch {
      // Test may have ended before icon fetch completed — ignore silently
    }
  });

  // Fast session check: context cookie + /api/user probe. No navigation, so
  // specs with valid storageState skip the per-test page load entirely.
  if (await sessionLooksValid(page)) {
    console.log("[Auth] ✓ Existing session still valid (storageState)");
    if (waitForUrl != null) {
      const targetUrl = typeof waitForUrl === "string" ? waitForUrl : "/dashboard";
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
      if (page.url().includes("/login") || page.url().includes("/setup")) {
        console.log(
          `[Auth] StorageState session lost after navigating to ${targetUrl} — re-authenticating`,
        );
      } else {
        if (waitForUrl instanceof RegExp) {
          await page.waitForURL(waitForUrl, { timeout: 10_000 }).catch(() => undefined);
        }
        return;
      }
    } else if (page.url() === "about:blank") {
      // No target and the tab is still blank (fresh context): land on the
      // default target so callers can rely on loginAsAdmin always ending on
      // a real page (login.spec.ts asserts non-about:blank after login).
      await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 20_000 });
      return;
    } else {
      return;
    }
  } else {
    const hasCookie = await page
      .context()
      .cookies()
      .then((cookies) => cookies.some((c) => SESSION_COOKIE_RE.test(c.name)))
      .catch(() => false);
    if (hasCookie) {
      console.log("[Auth] Session cookie present but /api/user rejected it — re-authenticating");
    }
  }

  try {
    // Login first; seed only if admin missing. Seed must NOT wipe users.
    const { applySessionCookie } = await import("./test-auth");
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
      // Force cookie into browser context with port-aware origin (page.request jar
      // alone is not always enough when storageState was cleared).
      await applySessionCookie(page, loginRes);
      console.log("[Auth] ✓ Admin session via testing API");
      const target = typeof waitForUrl === "string" ? waitForUrl : "/dashboard";
      await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const postAuthUrl = page.url();
      if (postAuthUrl.includes("/login")) {
        console.log(`[Auth] API session did not stick — at login page, falling back to UI login`);
      } else {
        if (waitForUrl instanceof RegExp) {
          await page.waitForURL(waitForUrl, { timeout: 15_000 }).catch(() => undefined);
        }
        const finalUrl = page.url();
        if (!finalUrl.includes("/login")) {
          return;
        }
      }
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

    // GDPR consent banner is a fixed z-9999 overlay in the bottom-left — the
    // same corner as the sign-out button — and swallows the click before it
    // reaches the sidebar (login.spec logout flake). Dismiss it first.
    await dismissCookieConsent(page);

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
      // Deterministic: wait for the sidebar shell instead of a fixed sleep
      await page
        .getByTestId("admin-sidebar")
        .first()
        .waitFor({ state: "visible", timeout: 3_000 })
        .catch(() => undefined);
      console.log("✓ Opened sidebar on mobile viewport");
      return true;
    }
  }
  return false;
}

/**
 * Dismiss the cookie consent banner.
 *
 * @deprecated Import `dismissCookieConsent` from "./cookie-consent" directly —
 * this alias keeps existing importers working during the consolidation.
 */
export const dismissCookieBanner = dismissCookieConsent;
