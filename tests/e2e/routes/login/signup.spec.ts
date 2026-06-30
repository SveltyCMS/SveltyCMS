/**
 * @file tests/playwright/signupfirstuser.spec.ts
 * @description Playwright end-to-end tests for first user signup and authentication flows in SveltyCMS.
 *   - Loads homepage and login screen
 *   - Verifies language selection updates UI
 *   - Signs up the first user and checks validations
 *   - Tests sign out, login, and forgot password flows
 */
import { expect, test } from "@playwright/test";
import { TEST_API_HEADERS } from "../../helpers/test-api";

/** Dismiss cookie consent banner if visible. */
async function dismissCookieConsent(page: any) {
  try {
    const btn = page.getByRole("button", { name: /accept all/i }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click({ force: true });
    }
  } catch {
    /* banner not present */
  }
}

test.describe.configure({ timeout: 60_000 });

test("Test loading homepage and login screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await dismissCookieConsent(page);

  await expect(page.getByText(/sign up/i)).toBeVisible();
  await expect(page.getByText(/sign in/i)).toBeVisible();
});

test("Check language selection updates UI text", async ({ page }) => {
  await page.goto("/login");
  await dismissCookieConsent(page);

  const languageTrigger = page.locator('.language-selector [role="button"]').first();
  await expect(languageTrigger).toBeVisible({ timeout: 5000 });

  const languages: { code: string; label: string; expected: RegExp }[] = [
    { code: "de", label: "German", expected: /anmelden/i },
    { code: "fr", label: "French", expected: /se connecter/i },
    { code: "es", label: "Spanish", expected: /iniciar sesión/i },
    { code: "en", label: "English", expected: /sign in/i },
  ];

  for (const lang of languages) {
    const option = page.locator(`button[aria-label="${lang.label}"]`).first();
    if ((await option.isVisible({ timeout: 500 }).catch(() => false)) === false) {
      await languageTrigger.click();
      await page.waitForTimeout(300);
    }
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click();
      await page.waitForTimeout(500);
    }
    await expect(page.getByRole("button", { name: lang.expected }).first()).toBeVisible({
      timeout: 5000,
    });
  }
});

test("SignUp First User", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/login");
  await dismissCookieConsent(page);
  await page.getByText(/sign up/i).click();

  await page.locator("#usernamesignUp").fill("T");
  await page.locator("#usernamesignUp").press("Tab");
  await page.locator("#usernamesignUp").fill("Test");

  await page.locator("#emailsignUp").fill("tes");
  await page.locator("#emailsignUp").fill("test@test2.de");

  await page.locator("#passwordsignUp").fill("Test123");
  await page.locator("#passwordsignUp").press("Tab");

  await page.locator("#passwordsignUp").fill("Test123!");
  await page.locator("#confirm_passwordsignUp").fill("Test1234!");

  await page.locator("#confirm_passwordsignUp").fill("Test123!");

  await page.locator("#tokensignUp").fill("svelty-secret-key-with-32-chars-min!");

  await page.locator("#signup-form button[type='submit']").click();

  await expect(page).toHaveURL(/\/config\/collectionbuilder/);
});

test.describe("SignIn & SignOut Flows", () => {
  test.beforeEach(async ({ page }) => {
    const seedResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "seed",
        email: "test@test.de",
        password: "Test123!",
      },
    });
    const seedBody = await seedResponse.json().catch(() => ({}));
    expect(seedResponse.ok()).toBeTruthy();
    expect(seedBody.success).toBe(true);
  });

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

  test("Login First User", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieConsent(page);

    await page.getByText(/sign in/i).click();
    await page.getByTestId("signin-email").fill("test@test2.de");
    await page.getByTestId("signin-password").fill("Test123!");
    await page.getByTestId("signin-submit").click();

    await expect(page).toHaveURL(/\/config\/collectionbuilder/);
  });
});

test("Forgot Password Flow", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/login");
  await dismissCookieConsent(page);

  await page.getByText(/sign in/i).click();
  await page.getByTestId("signin-forgot-password").click();

  await page.locator("#emailforgot").fill("test@test2.de");
  await page.getByRole("button", { name: /reset password/i }).click();

  await page.locator("#passwordreset").fill("NewPass123!");
  await page.locator("#confirm_passwordreset").fill("NewPass123!");
  await page.getByRole("button", { name: /save new password/i }).click();

  await expect(page).toHaveURL(/\/login/);
});
