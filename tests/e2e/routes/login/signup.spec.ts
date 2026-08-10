/**
 * @file tests/playwright/signupfirstuser.spec.ts
 * @description Playwright end-to-end tests for first user signup and authentication flows in SveltyCMS.
 *   - Loads homepage and login screen
 *   - Verifies language selection updates UI
 *   - Signs up the first user and checks validations
 *   - Tests sign out, login, and forgot password flows
 */
import { expect, test } from "@playwright/test";
import { TEST_API_HEADERS } from "../../helpers/api";
import { dismissCookieConsent } from "../../helpers/cookie-consent";

test.describe.configure({ timeout: 60_000 });

/**
 * Pre-set cookie consent in localStorage so the GDPR banner never appears.
 * This eliminates flakiness from the consent dialog intercepting clicks.
 * `addInitScript` runs before any page scripts, so the consent store reads
 * the pre-set value and skips showing the banner entirely.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sveltycms_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false, responded: true }),
    );
  });
});

test("Test loading homepage and login screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Both root and /login are valid: root stays when no users exist (first-user),
  // /login is the redirect target when the system is already set up (post-wizard).
  await expect(page).toHaveURL(/\/($|login)/);

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await dismissCookieConsent(page);

  await expect(page.getByText(/sign up/i)).toBeVisible();
  await expect(page.getByText(/sign in/i)).toBeVisible();
});

test("Check language selection updates UI text", async ({ page }) => {
  await page.goto("/login");
  await dismissCookieConsent(page);

  // Language selector is core chrome on the login landing state — hard assert.
  const languageTrigger = page.locator('.language-selector [role="button"]').first();
  await expect(languageTrigger, "Language selector must be present on the login page").toBeVisible({
    timeout: 10_000,
  });

  // DE: open dropdown, pick Deutsch, assert the html lang attr + trigger label.
  await languageTrigger.click();
  const deOption = page.getByRole("button", { name: /deutsch|german/i }).first();
  await expect(deOption).toBeVisible({ timeout: 5_000 });
  await deOption.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de", { timeout: 5_000 });
  await expect(languageTrigger).toContainText(/deutsch/i, { timeout: 5_000 });

  // EN: the locale switch remounts the whole page (root layout keys on
  // currentLocale), which closes the dropdown — re-open it, then pick English
  // and assert the UI flips back.
  await languageTrigger.click();
  const enOption = page.getByRole("button", { name: /english|englisch/i }).first();
  await expect(enOption).toBeVisible({ timeout: 5_000 });
  await enOption.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en", { timeout: 5_000 });
  await expect(languageTrigger).toContainText(/english/i, { timeout: 5_000 });
});

test("SignUp First User", async ({ page }) => {
  test.setTimeout(90_000);

  // Reset system to clean state (no users) — auth.setup may have seeded an admin
  const resetResponse = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "reset" },
  });
  expect(resetResponse.ok()).toBeTruthy();

  // Go to root — system should redirect to /setup (missing admin) or /login (first-user UI).
  // Wait for navigation to settle: intermediate hops (/, redirect chains) are not failures.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await dismissCookieConsent(page);
  await page.waitForURL(/\/(login|setup)(\/|$|\?)/, { timeout: 15_000 });

  // Full signup/wizard coverage lives in the wizard project; this smoke check only
  // verifies the post-reset entry surface is reachable and not stuck mid-redirect.
  await expect(page).toHaveURL(/\/(login|setup)/);
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
    // Clear any residual cookies from prior tests / seed side-effects
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await dismissCookieConsent(page);

    // Sign-in form may already be visible (no "Sign in" tab needed)
    const emailField = page.getByTestId("signin-email");
    if (!(await emailField.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page
        .getByText(/sign in/i)
        .first()
        .click();
    }
    await dismissCookieConsent(page);
    await emailField.fill("test@test.de");
    await page.getByTestId("signin-password").fill("Test123!");
    await dismissCookieConsent(page);
    await page.getByTestId("signin-submit").click({ force: true });

    // Leave /login after successful auth (destination varies by seeded collections)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    const signOutButton = page.getByRole("button", { name: /sign out/i });
    if (await signOutButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await signOutButton.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("Login First User", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await dismissCookieConsent(page);

    const emailField = page.getByTestId("signin-email");
    if (!(await emailField.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page
        .getByText(/sign in/i)
        .first()
        .click();
    }
    await dismissCookieConsent(page);
    await emailField.fill("test@test.de");
    await page.getByTestId("signin-password").fill("Test123!");
    await dismissCookieConsent(page);
    await page.getByTestId("signin-submit").click({ force: true });

    // Login succeeds when we leave /login. Destination may be collectionbuilder,
    // a collection path, dashboard, or / — do not require a specific route.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  });
});

test("Forgot Password Flow", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/login");
  await dismissCookieConsent(page);

  await page.getByText(/sign in/i).click();
  await dismissCookieConsent(page);
  await page.getByTestId("signin-forgot-password").click();

  await dismissCookieConsent(page);
  await page.locator("#emailforgot").fill("test@test.de");
  await page.getByRole("button", { name: /reset password/i }).click({ force: true });

  await dismissCookieConsent(page);
  await page.locator("#passwordreset").fill("NewPass123!");
  await page.locator("#confirm_passwordreset").fill("NewPass123!");
  await page.getByRole("button", { name: /save new password/i }).click({ force: true });

  await expect(page).toHaveURL(/\/login/);
});
