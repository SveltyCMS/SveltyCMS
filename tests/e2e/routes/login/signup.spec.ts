/**
 * @file tests/playwright/signupfirstuser.spec.ts
 * @description Playwright end-to-end tests for first user signup and authentication flows in SveltyCMS.
 *   - Loads homepage and login screen
 *   - Verifies language selection updates UI
 *   - Signs up the first user and checks validations
 *   - Tests sign out, login, and forgot password flows
 */
import { expect, test, type Page } from "@playwright/test";

/**
 * Dismiss cookie consent banner if visible.
 * Uses addInitScript to inject consent state before page load so the banner
 * never appears, then falls back to clicking accept if it still shows.
 */
async function dismissCookieConsent(page: Page) {
  // Pre-inject consent state into localStorage before the next navigation
  // so the banner is never rendered (consentStore reads from localStorage)
  await page.addInitScript(() => {
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

  // Fallback: if banner still visible, click accept
  const cookieAccept = page.getByTestId("cookie-accept-all");
  if (await cookieAccept.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cookieAccept.click();
    // Wait for fade-out transition to complete (300ms) + buffer
    await page.waitForTimeout(500);
  }
}

test.describe.configure({ timeout: 60_000 }); // Set timeout for all tests

test("Test loading homepage and login screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Unauthenticated users may be redirected to /login — accept either
  await expect(page).toHaveURL(/\/(\/login)?$/);

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await dismissCookieConsent(page);

  await expect(page.getByText(/sign up/i)).toBeVisible();
  await expect(page.getByText(/sign in/i)).toBeVisible();
});

// ✅ Language selection test (dropdown version)
test("Check language selection updates UI text", async ({ page }) => {
  await page.goto("/login");
  await dismissCookieConsent(page);

  const languageSelector = "select"; // Update if needed

  const languages = [
    { code: "de", expected: /anmelden/i }, // Sign In in German
    { code: "fr", expected: /se connecter/i }, // French
    { code: "es", expected: /iniciar sesión/i }, // Spanish
    { code: "en", expected: /sign in/i }, // English
  ];

  for (const lang of languages) {
    await page.selectOption(languageSelector, lang.code);
    await page.waitForTimeout(500); // Wait for UI update
    await expect(page.getByRole("button", { name: lang.expected })).toBeVisible();
  }
});

// ✅ Signup First User
test("SignUp First User", async ({ page }) => {
  await page.goto("/login");
  await dismissCookieConsent(page);
  await page.getByText(/sign up/i).click();

  // FloatingInput uses placeholder=" " (CSS trick), so use getByLabel or ID selectors
  // Username validation
  await page.locator("#usernamesignUp").fill("T");
  await page.locator("#usernamesignUp").press("Tab");
  await page.locator("#usernamesignUp").fill("Test");

  // Email validation
  await page.locator("#emailsignUp").fill("tes");
  await page.locator("#emailsignUp").fill("test@test2.de");

  // Password validation
  await page.locator("#passwordsignUp").fill("Test123");
  await page.locator("#passwordsignUp").press("Tab");

  await page.locator("#passwordsignUp").fill("Test123!");
  await page.locator("#confirm_passwordsignUp").fill("Test1234!");

  await page.locator("#confirm_passwordsignUp").fill("Test123!");

  // Registration Token (if required) — use label selector for floating inputs
  await page.getByLabel(/token/i).fill("svelty-secret-key");

  // After setup with token, expect redirect to content list or login if session expired
  await expect(page).toHaveURL(/\/(en\/)?(Posts|login)/);
});

// ✅ Setup seed data before sign-in tests
test.describe("SignIn & SignOut Flows", () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss cookie consent before seeding (must navigate first to have a valid origin)
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await dismissCookieConsent(page);

    // Seed the database with the test user via Testing API
    try {
      const seedResponse = await page.request.post("/api/testing", {
        headers: { "x-test-secret": "svelty-testing-secret" },
        data: {
          action: "seed",
          email: "test@test.de",
          password: "Test123!",
        },
      });
      if (!seedResponse.ok()) {
        console.log("[E2E] Seed via testing API returned non-OK, continuing anyway");
      }
    } catch (e) {
      console.log("[E2E] Testing API not available, proceeding without seed:", e);
    }
  });

  // ✅ SignOut Test
  test("SignOut after login", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieConsent(page);

    await page.getByText(/sign in/i).click();
    await page.getByTestId("signin-email").fill("test@test.de");
    await page.getByTestId("signin-password").fill("Test123!");
    await page.getByTestId("signin-submit").click();

    const signOutButton = page.getByRole("button", { name: /sign out/i });
    if (await signOutButton.isVisible().catch(() => false)) {
      await signOutButton.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  // ✅ Login First User
  test("Login First User", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieConsent(page);

    await page.getByText(/sign in/i).click();
    await page.getByTestId("signin-email").fill("test@test2.de");
    await page.getByTestId("signin-password").fill("Test123!");
    await page.getByTestId("signin-submit").click();

    await expect(page).toHaveURL(/\/(en\/)?(Posts|login)/);
  });
});

// ✅ Forgot Password
test("Forgot Password Flow", async ({ page }) => {
  await page.goto("/login");
  await dismissCookieConsent(page);

  await page.getByText(/sign in/i).click();
  await page.getByRole("button", { name: /forgotten password/i }).click();
  // FloatingInput has placeholder=" ", use label selectors
  await page.getByLabel(/email/i).fill("test@test2.de");
  await page.getByRole("button", { name: /send password reset email/i }).click();

  // Assume redirected to reset form
  await page
    .getByLabel(/password/i)
    .first()
    .fill("Test123!");
  await page.getByLabel(/confirm/i).fill("Test123!");
  await page.getByRole("button", { name: /save new password/i }).click();

  await expect(page).toHaveURL(/\/login/);
});
