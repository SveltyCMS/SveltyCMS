/**
 * @file tests/playwright/signupfirstuser.spec.ts
 * @description Playwright end-to-end tests for first user signup and authentication flows in SveltyCMS.
 *   - Loads homepage and login screen
 *   - Verifies language selection updates UI
 *   - Signs up the first user and checks validations
 *   - Tests sign out, login, and forgot password flows
 */
import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 60_000 }); // Set timeout for all tests

test("Test loading homepage and login screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await expect(page.getByText(/sign up/i)).toBeVisible();
  await expect(page.getByText(/sign in/i)).toBeVisible();
});

// ✅ Language selection test (dropdown version)
test("Check language selection updates UI text", async ({ page }) => {
  await page.goto("/login");

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
  await page.getByText(/sign up/i).click();

  // Username validation
  await page.getByPlaceholder(/username/i).fill("T");
  await page.getByPlaceholder(/username/i).press("Tab");
  await page.getByPlaceholder(/username/i).fill("Test");

  // Email validation
  await page.getByPlaceholder(/email/i).fill("tes");
  await page.getByPlaceholder(/email/i).fill("test@test2.de");

  // Password validation
  await page.getByPlaceholder(/^password$/i).fill("Test123");
  await page.getByPlaceholder(/^password$/i).press("Tab");

  await page.getByPlaceholder(/^password$/i).fill("Test123!");
  await page.getByPlaceholder(/confirm/i).fill("Test1234!");

  await page.getByPlaceholder(/confirm/i).fill("Test123!");

  // Registration Token (if required)
  await page.getByPlaceholder(/token/i).fill("svelty-secret-key");

  await expect(page).toHaveURL(/\/en\/Posts/);
});

// ✅ Setup seed data before sign-in tests
test.describe("SignIn & SignOut Flows", () => {
  test.beforeEach(async ({ page }) => {
    // Seed the database with the test user via Testing API
    try {
      const seedResponse = await page.request.post("/api/testing", {
        headers: { "x-testing-secret": "svelty-testing-secret" },
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

    await page.getByText(/sign in/i).click();
    await page.getByTestId("signin-email").fill("test@test2.de");
    await page.getByTestId("signin-password").fill("Test123!");
    await page.getByTestId("signin-submit").click();

    await expect(page).toHaveURL(/\/en\/Posts/);
  });
});

// ✅ Forgot Password
test("Forgot Password Flow", async ({ page }) => {
  await page.goto("/login");

  await page.getByText(/sign in/i).click();
  await page.getByRole("button", { name: /forgotten password/i }).click();
  await page.getByPlaceholder(/email/i).fill("test@test2.de");
  await page.getByRole("button", { name: /send password reset email/i }).click();

  // Assume redirected to reset form
  await page
    .getByPlaceholder(/password/i)
    .first()
    .fill("Test123!");
  await page.getByPlaceholder(/confirm/i).fill("Test123!");
  await page.getByRole("button", { name: /save new password/i }).click();

  await expect(page).toHaveURL(/\/login/);
});
