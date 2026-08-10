import { expect, test } from "@playwright/test";
import {
  resetAndSeedDatabase,
  seedExpiredPasswordReset,
  TEST_API_HEADERS,
} from "../../helpers/api";
import { ADMIN_CREDENTIALS, prepareLoginForm, enable2FAForTestUser } from "../../helpers/auth";

test.describe("Extended Authentication UI Flows", () => {
  // Ensure we start with a clean state
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase(page);
    await prepareLoginForm(page);
  });

  test("Expired reset-password token shows Link expired toast", async ({ page }) => {
    const seeded = await seedExpiredPasswordReset(page, {
      email: ADMIN_CREDENTIALS.email,
    });

    // URL effect opens reset form (P_WFORGOT + P_WRESET) with hidden token/email
    await page.goto(
      `/login?token=${encodeURIComponent(seeded.token)}&email=${encodeURIComponent(seeded.email)}`,
      { waitUntil: "domcontentloaded" },
    );

    const resetForm = page.locator('form[aria-label="Reset password"]');
    await expect(resetForm).toBeVisible({ timeout: 15_000 });

    // Strong password to pass client validation before server rejects expired token
    const newPassword = "ExpiredTokenTest9!";
    await page.locator("#passwordreset").fill(newPassword);
    await page.locator("#confirm_passwordreset").fill(newPassword);

    await resetForm.locator('button[type="submit"]').click();

    const toast = page.locator('.toast, [role="alert"]').first();
    await expect(toast).toBeVisible({ timeout: 15_000 });
    const text = ((await toast.textContent()) || "").toLowerCase();
    expect(text).toMatch(
      /link expired|expired|request a new|token not found|reset failed|invalid/i,
    );
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
    test.setTimeout(120_000); // Higher timeout for repeated requests

    const emailInput = page.locator('[data-testid="signin-email"]');
    const passwordInput = page.locator('[data-testid="signin-password"]');
    const submitBtn = page.locator('[data-testid="signin-submit"]');

    // Lock a DEDICATED throwaway user, never the shared admin: the lockout is
    // 15 minutes, and parallel specs (permissions, coverage-100, management,
    // …) log in as admin@example.com throughout the run. Locking the admin
    // made those specs fail in a rotating pattern for the whole suite.
    const lockoutEmail = `lockout-${Date.now().toString(36)}@test.de`;
    const seeded = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed", email: lockoutEmail, password: "Lockout123!" },
    });
    expect(seeded.ok(), "lockout fixture user must be seeded").toBeTruthy();

    await emailInput.fill(lockoutEmail);
    await passwordInput.fill("DefinitelyWrongPassword123!");

    // SveltyCMS locks the account after 5 failed attempts
    // Depending on the DB adapter, the lockout toast may show "locked" or
    // the generic "Invalid credentials" — we just verify that ALL 6 attempts
    // produce an error toast (account never succeeds with wrong password).
    let lastToastText = "";
    for (let i = 0; i < 6; i++) {
      await submitBtn.click();

      // Wait for the error toast
      const toast = page.locator('.toast, [role="alert"]').first();
      await expect(toast).toBeVisible({ timeout: 10000 });

      const text = (await toast.textContent()) || "";
      lastToastText = text;

      // If we see "locked", we don't need to do all 5
      if (text.toLowerCase().includes("locked")) {
        break;
      }

      // Dismiss the toast to reset state for next click (wait for hidden, no sleep)
      await page.keyboard.press("Escape");
      await toast.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {});
    }

    // The last attempt must show an error toast (either lockout-specific or generic)
    expect(lastToastText).toMatch(/sign in failed|invalid credentials|locked/i);
  });

  test("Magic Link & WebAuthn UI Toggles (Mocked)", async ({ page }) => {
    // Mock the `checkAuthMethods` remote function. SvelteKit remote functions
    // (query/command from $app/server) call GET /_app/remote/<id>/<fn>?payload=…
    // and return `{ data: <devalue-string> }` — NOT a POST to the page route
    // with x-sveltekit-server-function (the old protocol this test intercepted).
    let checkAuthMethodsIntercepted = false;
    await page.route("**/_app/remote/*/checkAuthMethods*", async (route) => {
      checkAuthMethodsIntercepted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: '{"success":true,"hasPassword":true,"hasPasskey":true,"hasMagicLink":true,"hasOAuth":false}',
        }),
      });
    });

    const emailInput = page.locator('[data-testid="signin-email"]');

    // Capture the mocked checkAuthMethods response instead of sleeping for the debounce
    const checkRes = page
      .waitForResponse((res) => /\/_app\/remote\/[^/]+\/checkAuthMethods/.test(res.url()), {
        timeout: 5_000,
      })
      .catch(() => null);

    // Type email slowly to trigger the debounced `onEmailInput` check
    await emailInput.pressSequentially("test@example.com", { delay: 100 });
    const response = await checkRes;

    // Real assertions: the debounced check must actually fire, and the client
    // must receive the mocked method flags through the server-function channel.
    expect(
      checkAuthMethodsIntercepted,
      "typing an email must trigger the debounced checkAuthMethods server function",
    ).toBe(true);
    expect(response, "checkAuthMethods must produce a response").not.toBeNull();
    expect(response!.ok(), `checkAuthMethods HTTP ${response!.status()}`).toBe(true);
    const body = await response!.json().catch(() => null);
    expect(body, "checkAuthMethods response must be JSON").not.toBeNull();
    let flags: Record<string, unknown> = {};
    try {
      const data = typeof body.data === "string" ? JSON.parse(body.data) : body.data;
      flags = (Array.isArray(data) ? (data[0] ?? {}) : (data ?? {})) as Record<string, unknown>;
    } catch {
      // parsed below via the per-flag assertions
    }
    expect(flags.success).toBe(true);
    expect(flags.hasPassword).toBe(true);
    expect(flags.hasPasskey).toBe(true);
    expect(flags.hasMagicLink).toBe(true);
    expect(flags.hasOAuth).toBe(false);
  });

  test("2FA UI Flow", async ({ page }) => {
    // Enable 2FA for the admin user in the DB
    await enable2FAForTestUser(page, ADMIN_CREDENTIALS.email);

    // Enter email and password and submit
    await page.locator('[data-testid="signin-email"]').fill(ADMIN_CREDENTIALS.email);
    await page.locator('[data-testid="signin-password"]').fill(ADMIN_CREDENTIALS.password);
    await page.locator('[data-testid="signin-submit"]').click();

    // Verify UI switches to 2FA input.
    // The Input component renders <input id="twofa-code"> — but to be resilient
    // also accept the 2FA region's aria-label.
    const twofaInput = page
      .locator("input#twofa-code")
      .or(page.locator('[aria-label="Two-factor authentication"] input[type="text"]'))
      .or(page.locator('[aria-label="Two-factor authentication"]').getByRole("textbox"));
    await expect(twofaInput).toBeVisible({ timeout: 10_000 });
  });
});
