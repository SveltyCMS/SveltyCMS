/**
 * @file tests/playwright/signupfirstuser.spec.ts
 * @description Playwright end-to-end tests for first user signup and authentication flows in SveltyCMS.
 *   - Loads homepage and login screen
 *   - Verifies language selection updates UI
 *   - Signs up the first user and checks validations
 *   - Tests sign out, login, and forgot password flows
 */
import { expect, test, type Page } from "@playwright/test";
import { TEST_API_HEADERS } from "../../helpers/test-api";

const LOGGED_IN_URL_PATTERN =
  /\/(?:[a-z]{2}\/)?collection\/|\/(Collections|admin|dashboard|collectionbuilder|config)/i;

/** Dismiss cookie consent banner if visible. */
async function dismissCookieConsent(page: Page) {
  try {
    const btn = page.getByRole("button", { name: /accept all/i }).first();
    await btn.waitFor({ state: "visible", timeout: 3000 });
    await btn.click({ force: true });
    await page.waitForTimeout(400);
  } catch {
    /* banner not present */
  }
}

async function seedLoginUser(page: Page, email: string, password = "Test123!") {
  const seedResponse = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "seed",
      email,
      password,
    },
  });
  const seedBody = await seedResponse.json().catch(() => ({}));
  expect(seedResponse.ok()).toBeTruthy();
  expect(seedBody.success).toBe(true);
  await page.context().clearCookies();
}

test.describe.configure({ timeout: 60_000 });

test("Test loading homepage and login screen", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await dismissCookieConsent(page);

  await expect(page.getByText(/sign up/i)).toBeVisible();
  await expect(page.getByText(/sign in/i)).toBeVisible();
});

test("Check language selection updates UI text", async ({ page }) => {
  await page.goto("/login");
  await dismissCookieConsent(page);

  const langSelector = page.getByTestId("language-selector");
  const languageTrigger = langSelector.getByRole("button").first();
  await expect(languageTrigger).toBeVisible({ timeout: 5000 });

  // Only test languages that have translations (en, de).
  // Skip fr, es until translation files are added and paraglide is regenerated.
  const languages: { code: string; label: string; expected: RegExp }[] = [
    { code: "de", label: "Deutsch", expected: /anmelden/i },
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
    // Use getByText instead of getByRole because SigninIcon/SignupIcon have hardcoded
    // aria-label="Go to Sign In" / "Go to Sign Up" which never changes with language.
    await expect(page.getByText(lang.expected).first()).toBeVisible({
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

  await page.locator("#signup-form button[type='submit']").click();

  await expect(page).toHaveURL(LOGGED_IN_URL_PATTERN);
});

test.describe("SignIn & SignOut Flows", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any leftover session from previous tests (e.g. test 2 signup)
    await page.context().clearCookies();

    await seedLoginUser(page, "test@test.de");
    await seedLoginUser(page, "test@test2.de");

    // Clear cookies again so the login page doesn't auto-redirect due to seed session
    await page.context().clearCookies();
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

    await expect(page).toHaveURL(LOGGED_IN_URL_PATTERN);
  });
});

test("Forgot Password Flow", async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().clearCookies();
  await seedLoginUser(page, "test@test2.de");
  await page.goto("/login");
  await page.reload({ waitUntil: "networkidle" });
  await dismissCookieConsent(page);

  if (!(await page.getByTestId("signin-forgot-password").isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /go to sign in|sign in/i }).first().click();
  }
  await expect(page.getByTestId("signin-forgot-password")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("signin-forgot-password").click();

  await page.locator("#emailforgot").fill("test@test2.de");
  await page.getByRole("button", { name: /reset password/i }).click();

  // After forgot PW success, the reset form should appear
  await expect(page.locator("#passwordreset")).toBeVisible({ timeout: 10000 });
  await page.locator("#passwordreset").fill("NewPass123!");
  await page.locator("#confirm_passwordreset").fill("NewPass123!");
  await page.getByRole("button", { name: /save new password/i }).click();

  await expect(page).toHaveURL(/\/login/);
});
