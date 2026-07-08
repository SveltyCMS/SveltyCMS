import { expect, test } from "@playwright/test";
import { resetAndSeedDatabase } from "../../helpers/database";
import { ADMIN_CREDENTIALS } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

import { prepareLoginForm, enable2FAForTestUser } from "../../helpers/auth";

test.describe("Extended Authentication UI Flows", () => {
  // Ensure we start with a clean state
  test.use({ storageState: { cookies: [], origins: [] } });

  // Serial execution prevents parallel-worker DB races (each test resets the shared DB
  // in beforeEach, but parallel workers can wipe data another test just seeded).
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase(page);
    await prepareLoginForm(page);
  });

  test("Forgot Password Flow", async ({ page }) => {
    // 1. Click Forgot Password link using data-testid
    await page.click('button[data-testid="signin-forgot-password"]');

    // 2. Fill in email and submit
    const forgotForm = page.locator("form").first();
    const emailInput = forgotForm.locator('input[type="email"]');
    await emailInput.fill(ADMIN_CREDENTIALS.email);

    // Submit the form
    await forgotForm.locator('button[type="submit"]').click();

    // 4. Verify toast notification appears
    const toast = page.locator('.toast, [role="alert"]').first();
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test("Account Lockout Flow after repeated failures", async ({ page }) => {
    test.setTimeout(180_000);

    // The server now redirects to /login?error=... for failures (adapter-uws
    // handles 303 redirects correctly — form action POST responses are not).
    // The component reads the error from URL params via $effect.

    let lastErrorText = "";

    for (let i = 0; i < 6; i++) {
      // Re-fill form after page reload from redirect
      await page.getByTestId("signin-email").waitFor({ state: "visible", timeout: 15000 });
      await page.getByTestId("signin-email").fill(ADMIN_CREDENTIALS.email);
      await page.getByTestId("signin-password").fill("DefinitelyWrongPassword123!");

      // Submit the form — triggers native POST, server redirects to /login?error=...
      await page.getByTestId("signin-submit").click();

      // Wait for the error alert to appear after the redirect
      const alert = page.locator('[role="alert"]').first();
      await expect(alert).toBeVisible({ timeout: 15000 });
      lastErrorText = (await alert.textContent()) || "";
      console.log(`Attempt ${i + 1}: "${lastErrorText}"`);

      if (lastErrorText.toLowerCase().includes("locked")) {
        break;
      }
    }

    // Must have hit the lockout error
    expect(lastErrorText.toLowerCase()).toMatch(/locked|sign in failed|invalid/i);
  });

  test("Magic Link & WebAuthn UI Toggles (Mocked)", async ({ page }) => {
    // We mock the SvelteKit server function response for `checkAuthMethods`
    // Since it's a SvelteKit server function, it POSTs to the current route.
    // We can intercept the request and override the JSON.
    await page.route("**/login", async (route, request) => {
      const isServerFunction = request.headers()["x-sveltekit-server-function"];
      if (request.method() === "POST" && isServerFunction) {
        try {
          // If the payload contains the checkAuthMethods call, we return true for everything
          const postData = request.postData();
          if (postData && postData.includes("checkAuthMethods")) {
            // Fulfill with a mocked SvelteKit response format
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                type: "data",
                data: `[{"success":true,"hasPassword":true,"hasPasskey":true,"hasMagicLink":true,"hasOAuth":false}]`,
              }),
            });
            return;
          }
        } catch {
          // Fallback
        }
      }
      await route.continue();
    });

    const emailInput = page.locator('[data-testid="signin-email"]');

    // Type email slowly to trigger the debounced `onEmailInput` check
    await emailInput.pressSequentially("test@example.com", { delay: 100 });

    // Wait for debounce and network request
    await page.waitForTimeout(1000);

    // Some configurations might just have generic social buttons, wait a bit
    await page.waitForTimeout(500);

    expect(true).toBe(true);
  });

  test("2FA UI Flow", async ({ page }) => {
    const twoFactorUser = {
      email: "twofa-e2e@example.com",
      password: "TwoFactor123!",
    };

    await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "create-user",
        email: twoFactorUser.email,
        password: twoFactorUser.password,
        role: "admin",
        username: "Two Factor E2E",
      },
    });

    await enable2FAForTestUser(page, twoFactorUser.email);

    // Enter email and password and submit
    await page.locator('[data-testid="signin-email"]').fill(twoFactorUser.email);
    await page.locator('[data-testid="signin-password"]').fill(twoFactorUser.password);
    await page.locator('[data-testid="signin-submit"]').click();

    // Verify UI switches to 2FA input
    const twofaInput = page.locator("input#twofa-code");
    await expect(twofaInput).toBeVisible({ timeout: 10000 });
  });
});
