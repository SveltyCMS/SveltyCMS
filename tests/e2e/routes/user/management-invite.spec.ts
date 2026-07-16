/**
 * @file tests/e2e/routes/user/management-invite.spec.ts
 * @description Isolated E2E: admin invite token flow (split from management.spec.ts).
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("User Management — Invite Flow", () => {
  test.setTimeout(120_000);

  test("invite user via email token and accept signup", async ({ page, browser }) => {
    await loginAsAdmin(page);
    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page).toHaveURL(/\/user/, { timeout: 15_000 });
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: 15_000 });

    // Admin area is below the profile cards — wait for it before interacting
    const adminArea = page.getByTestId("user-admin-area");
    await expect(adminArea).toBeVisible({ timeout: 20_000 });
    await adminArea.scrollIntoViewIfNeeded();

    const emailTokenBtn = page.getByTestId("email-registration-token-btn");
    await expect(emailTokenBtn).toBeVisible({ timeout: 15_000 });
    await emailTokenBtn.click();

    // Modal title is "Edit Token Data" (multibuttontoken_modaltitle)
    const tokenDialog = page.getByRole("dialog").filter({ hasText: /token/i }).first();
    await expect(tokenDialog).toBeVisible({ timeout: 15_000 });

    const inviteEmail = `newuser_${Date.now()}@example.com`;
    const emailInput = tokenDialog.locator('input[name="email"]:not([disabled])');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await emailInput.fill(inviteEmail);

    // Prefer "user" role chip when present; default form role is admin which still works for signup
    const roleChip = tokenDialog.getByRole("button", { name: /^user$/i });
    if (await roleChip.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await roleChip.click();
    }

    await tokenDialog.getByRole("button", { name: /save/i }).click();

    await expect(
      tokenDialog.getByRole("heading", { name: /Invitation Token Created/i }),
    ).toBeVisible({
      timeout: 20_000,
    });

    const inviteLinkInput = tokenDialog.getByRole("textbox", {
      name: /token name|invitation link/i,
    });
    // Fallback: readonly invitation link field
    const inviteInput = (await inviteLinkInput.count())
      ? inviteLinkInput
      : tokenDialog.locator("input[readonly]").first();
    await expect(inviteInput).toHaveValue(/invite_token=/, { timeout: 15_000 });
    const inviteUrl = await inviteInput.inputValue();

    const inviteContext = await browser.newContext();
    await inviteContext.addInitScript(() => {
      localStorage.setItem(
        "sveltycms_consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false, responded: true }),
      );
    });
    const invitePage = await inviteContext.newPage();
    try {
      await invitePage.goto(inviteUrl, { waitUntil: "domcontentloaded" });
      const signUpBtn = invitePage.getByRole("button", { name: /Go to Sign Up/i });
      await signUpBtn.waitFor({ state: "visible", timeout: 15_000 });
      await signUpBtn.click();

      await expect(invitePage.locator("#signup-form")).toBeVisible({ timeout: 10_000 });
      await expect(invitePage.locator("#emailsignUp")).toHaveValue(inviteEmail, {
        timeout: 10_000,
      });
      await expect(invitePage.locator('input[type="hidden"][name="token"]')).toHaveValue(/.+/, {
        timeout: 5_000,
      });

      const inviteUsername = `newuser_${Date.now()}`;
      await invitePage.locator("#usernamesignUp").fill(inviteUsername);
      await invitePage.locator("#passwordsignUp").fill("user@123!");
      await invitePage.locator("#confirm_passwordsignUp").fill("user@123!");
      await invitePage.getByRole("button", { name: /accept invitation/i }).click();
      await expect(invitePage).not.toHaveURL(/\/login/, { timeout: 20_000 });
    } finally {
      await inviteContext.close();
    }
  });
});
