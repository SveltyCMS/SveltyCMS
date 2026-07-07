/**
 * @file tests/playwright/user-crud.spec.ts
 * @description Playwright end-to-end tests for user management CRUD flows in SveltyCMS.
 *   - Admin login
 *   - Read and edit user profile
 *   - Delete, block, and unblock users
 *   - Invite user via email and accept invitation
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { seedTestUsers } from "../../helpers/seed";

test.describe.serial("User Management Flow", () => {
  test.setTimeout(120_000); // 2 min timeout

  test.beforeAll(async ({ browser }) => {
    // Ensure developer/editor users exist for block/delete/invite flows.
    // Idempotent (skips if already present) — do NOT reset, since profile.spec.ts
    // runs in parallel within this project and shares the same DB.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await seedTestUsers(page);
    } catch (error) {
      console.error("Failed to seed test users:", error);
    } finally {
      await context.close();
    }
  });

  test("Admin Login", async ({ page }) => {
    await loginAsAdmin(page);
    // Verify login succeeded — should not be on /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    // Accept any admin page content as success (dashboard, collections, etc.)
    await expect(page.locator("body")).not.toHaveText(/sign in/i, { timeout: 5_000 });
  });

  test("Read and Edit User Profile", async ({ page }) => {
    // Login
    await loginAsAdmin(page);

    // Go to User Profile
    await page.getByRole("link", { name: /user profile/i }).click();

    // ✅ READ operation - assert user profile visible
    await expect(page.locator("h1")).toContainText(/user profile/i);

    // ✅ UPDATE operation - Edit user info (scoped to the modal dialog)
    await page.getByRole("button", { name: /edit user settings/i }).click();
    const editDialog = page.getByRole("dialog", { name: /Edit User Data/i });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });
    await editDialog.locator('input[name="username"]:not([disabled])').fill("updatedUser");
    await editDialog.getByRole("button", { name: /save/i }).click();

    // Confirm update saved via the success toast (modal closes on success)
    await expect(page.getByText(/User Data Updated/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Delete, Block, and Unblock Users", async ({ page }) => {
    // Login
    await loginAsAdmin(page);

    // Go to User Profile
    await page.getByRole("link", { name: /user profile/i }).click();

    // Block, then Unblock, and finally Delete the seeded developer user
    // (admins cannot be blocked/deleted; developer@example.com is seeded in beforeAll)
    const actions = ["Block", "Unblock", "Delete"];

    for (const action of actions) {
      // Find row for developer@example.com and check the checkbox
      const row = page.locator("tr", { hasText: "developer@example.com" });
      await row.getByRole("checkbox").first().click();

      // Click dropdown button to open menu
      await page.getByRole("button", { name: /Toggle bulk actions menu/i }).click();

      // Select action — match the menuitem by its exact aria-label
      // ("Select <action> action"). A bare /Block/i also matches "Unblock",
      // which triggers a strict-mode violation.
      await page.getByRole("menuitem", { name: `Select ${action} action` }).click();

      // Click Confirm
      await page.getByRole("button", { name: /confirm/i }).click();

      // Wait for the success toast. A bare /<action>/i is ambiguous: the main
      // action button still shows the uppercase label (e.g. "BLOCK") and the
      // confirm modal title also contains the action word. The toast message
      // is "<type> <action>ed" (e.g. "Users Blocked"), so scope to that prefix.
      await expect(page.getByText(new RegExp(`(?:User|Users)\\s+${action}`, "i"))).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test("Invite User via Email and Accept Invitation", async ({ page, browser }) => {
    // Login
    await loginAsAdmin(page);

    // Go to User Profile
    await page.getByRole("link", { name: /user profile/i }).click();

    // Click on email user registration token
    await page.getByRole("button", { name: /email user registration token/i }).click();

    // Scoped to the token dialog
    const tokenDialog = page.getByRole("dialog", { name: /Edit Token Data/i });
    await expect(tokenDialog).toBeVisible({ timeout: 10_000 });

    // Fill form. Use a unique email per run so re-runs don't collide with the
    // already-registered user from a previous run (the signup form rejects
    // duplicate emails with "user already exists").
    const inviteEmail = `newuser_${Date.now()}@example.com`;
    await tokenDialog.locator('input[name="email"]:not([disabled])').fill(inviteEmail);
    // Select role — chip buttons inside the dialog (role names: admin/developer/editor/user)
    const roleChip = tokenDialog.getByRole("button", { name: /^user$/i });
    if (await roleChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleChip.click();
    }
    await tokenDialog.getByRole("button", { name: /save/i }).click();

    // After success the modal stays open and renders an "Invitation Token Created"
    // panel with a copyable invite link. The link input is a readonly textbox with
    // aria-label "Token name" whose *value* (a property, not the attribute) holds
    // the invite URL — so a CSS attribute selector (input[value*=...]) does NOT
    // match it. Use a role-based locator and assert on its value instead.
    await expect(
      tokenDialog.getByRole("heading", { name: /Invitation Token Created/i }),
    ).toBeVisible({ timeout: 15_000 });

    const inviteLinkInput = tokenDialog.getByRole("textbox", { name: "Token name" });
    await expect(inviteLinkInput).toHaveValue(/invite_token=/, { timeout: 15_000 });
    const inviteUrl = await inviteLinkInput.inputValue();

    // The /login?invite_token=... signup page redirects authenticated users to
    // the admin home (login/+page.server.ts line ~238). Accept the invitation
    // from a fresh, unauthenticated context so the signup form actually renders.
    const inviteContext = await browser.newContext();
    // Pre-set cookie consent so the GDPR banner doesn't intercept clicks in
    // the fresh context (mirrors signup.spec.ts' addInitScript approach).
    await inviteContext.addInitScript(() => {
      localStorage.setItem(
        "sveltycms_consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false, responded: true }),
      );
    });
    const invitePage = await inviteContext.newPage();
    try {
      await invitePage.goto(inviteUrl, { waitUntil: "networkidle" });

      // New visitors land on the Sign In / Sign Up chooser (active === undefined
      // in login/+page.svelte). Click "Go to Sign Up" to reveal the signup form,
      // which is pre-filled for the invite flow (isInviteFlow + invitedEmail).
      // Use waitFor (not isVisible) — Locator.isVisible() returns immediately
      // and can miss the button during SvelteKit hydration; waitFor waits.
      const signUpBtn = invitePage.getByRole("button", { name: /Go to Sign Up/i });
      await signUpBtn.waitFor({ state: "visible", timeout: 15_000 });
      await signUpBtn.click();

      // Wait for the signup form to render (active transitions to 1), then wait
      // for the email field. The invite flow pre-fills email + hidden token from
      // the server load (isInviteFlow + invitedEmail), set via a $effect.
      await expect(invitePage.locator("#signup-form")).toBeVisible({ timeout: 10_000 });

      // Check prefilled email (scoped by id to avoid the OAuth duplicate inputs).
      await expect(invitePage.locator("#emailsignUp")).toHaveValue(inviteEmail, {
        timeout: 10_000,
      });
      // In the invite flow the visible #tokensignUp field is NOT rendered — the
      // token is carried in a hidden input. Assert the hidden token input carries
      // the invite token instead.
      await expect(invitePage.locator('input[type="hidden"][name="token"]')).toHaveValue(/.+/, {
        timeout: 5_000,
      });

      // Fill remaining signup fields (unique username to avoid collisions across re-runs)
      const inviteUsername = `newuser_${Date.now()}`;
      await invitePage.locator("#usernamesignUp").fill(inviteUsername);
      await invitePage.locator("#passwordsignUp").fill("user@123!");
      await invitePage.locator("#confirm_passwordsignUp").fill("user@123!");

      await invitePage.getByRole("button", { name: /accept invitation/i }).click();

      // Success: the page redirects away from /login after account creation.
      // The "Account Created!" toast may be too transient to catch reliably across
      // a full navigation, so assert the redirect as the primary success signal.
      await expect(invitePage).not.toHaveURL(/\/login/, { timeout: 20_000 });
    } finally {
      await inviteContext.close();
    }
  });
});
