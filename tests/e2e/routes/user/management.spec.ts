/**
 * @file tests/playwright/user-crud.spec.ts
 * @description Playwright end-to-end tests for user management CRUD flows in SveltyCMS.
 *   - Admin login
 *   - Read and edit user profile
 *   - Delete, block, and unblock users
 *   - Invite user via email and accept invitation
 */
import { expect, type Page, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { prepareTestUser, seedTestUsers, TEST_USERS } from "../../helpers/seed";

const DEVELOPER_EMAIL = TEST_USERS.developer.email;
const ACTION_TIMEOUT = 15_000;

/** Open /user and wait until the admin user table is interactive. */
async function openUserAdminArea(page: Page) {
  await page.goto("/user", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  await ensureUserListVisible(page);
  await expect(page.getByRole("button", { name: /Toggle bulk actions menu/i })).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  // Wait for the initial user-list fetch to settle before row lookups.
  await page
    .waitForResponse(
      (res) => res.url().includes("/api/user") && res.request().method() === "GET" && res.ok(),
      { timeout: ACTION_TIMEOUT },
    )
    .catch(() => undefined);
}

/** User list can be toggled off; restore it before row interactions. */
async function ensureUserListVisible(page: Page) {
  const showList = page.getByRole("button", { name: /show user list/i });
  if (await showList.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await showList.click({ timeout: ACTION_TIMEOUT });
  }
}

/** Open table search without toggling it closed if already expanded. */
async function openTableSearch(page: Page) {
  const searchInput = page.getByRole("textbox", {
    name: /search for items in the table/i,
  });
  if (!(await searchInput.isVisible({ timeout: 1_000 }).catch(() => false))) {
    await page.getByRole("button", { name: /^search$/i }).click({ timeout: ACTION_TIMEOUT });
  }
  await expect(searchInput).toBeVisible({ timeout: ACTION_TIMEOUT });
  return searchInput;
}

type DeveloperRowOptions = {
  /** When false, keep search cleared so Multibutton sees the full user count. */
  useSearch?: boolean;
};

/** Locate the developer row; search filter avoids pagination races for row actions. */
async function developerRow(page: Page, options: DeveloperRowOptions = { useSearch: true }) {
  const useSearch = options.useSearch ?? true;

  for (let attempt = 0; attempt < 2; attempt++) {
    await ensureUserListVisible(page);

    if (useSearch) {
      const searchInput = await openTableSearch(page);
      const refetch = page
        .waitForResponse(
          (res) => res.url().includes("/api/user") && res.request().method() === "GET",
          { timeout: ACTION_TIMEOUT },
        )
        .catch(() => undefined);
      await searchInput.fill(DEVELOPER_EMAIL);
      // AdminArea debounces search by 300ms before refetching.
      await page.waitForTimeout(400);
      await refetch;
    } else {
      await clearTableSearch(page);
    }

    const row = page.locator("tbody tr").filter({ hasText: DEVELOPER_EMAIL });
    try {
      await expect(row).toHaveCount(1, { timeout: ACTION_TIMEOUT });
      return row;
    } catch (error) {
      if (attempt === 0) {
        await prepareTestUser(page, "developer");
        await openUserAdminArea(page);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`developer row not found for ${DEVELOPER_EMAIL}`);
}

async function selectDeveloperRow(page: Page, options?: DeveloperRowOptions) {
  const row = await developerRow(page, options);
  const checkbox = row.getByRole("checkbox", { name: "Toggle selection" });
  await checkbox.scrollIntoViewIfNeeded();
  const checked = await checkbox.getAttribute("aria-checked");
  if (checked !== "true") {
    await checkbox.click({ timeout: ACTION_TIMEOUT });
  }
}

/** Block or unblock a single user via the per-row action button (admin-area.svelte). */
async function runRowUserAction(page: Page, action: "block" | "unblock") {
  const row = await developerRow(page);
  const rowButton = row.getByRole("button", {
    name: action === "block" ? /click to block user/i : /click to unblock user/i,
  });
  await expect(rowButton).toBeVisible({ timeout: ACTION_TIMEOUT });
  await rowButton.scrollIntoViewIfNeeded();
  await rowButton.click({ timeout: ACTION_TIMEOUT });

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
  await dialog.getByRole("button", { name: /confirm/i }).click({ timeout: ACTION_TIMEOUT });

  await expect(page.getByText(new RegExp(`User ${action}ed successfully`, "i"))).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
}

/** Clear table search so bulk actions use the full user count (not filtered totalItems). */
async function clearTableSearch(page: Page) {
  const searchInput = page.getByRole("textbox", {
    name: /search for items in the table/i,
  });
  if (await searchInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
    const refetch = page
      .waitForResponse(
        (res) => res.url().includes("/api/user") && res.request().method() === "GET",
        { timeout: ACTION_TIMEOUT },
      )
      .catch(() => undefined);
    await searchInput.fill("");
    await page.waitForTimeout(400);
    await refetch;
  }
}

/** Bulk-delete the selected developer row via Multibutton. */
async function bulkDeleteDeveloper(page: Page) {
  // Select without search — filtered totalItems=1 disables bulk delete in Multibutton.
  await selectDeveloperRow(page, { useSearch: false });

  const bulkMenu = page.getByRole("button", { name: /Toggle bulk actions menu/i });
  await expect(bulkMenu).toBeEnabled({ timeout: ACTION_TIMEOUT });

  const executeDelete = page.getByRole("button", { name: "Execute Delete action" });
  if (await executeDelete.isEnabled({ timeout: 2_000 }).catch(() => false)) {
    await executeDelete.click({ timeout: ACTION_TIMEOUT });
  } else {
    await bulkMenu.click({ timeout: ACTION_TIMEOUT });
    const deleteItem = page.getByRole("menuitem", { name: /select delete action/i });
    await expect(deleteItem).toBeEnabled({ timeout: ACTION_TIMEOUT });
    await deleteItem.click({ timeout: ACTION_TIMEOUT });
  }

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
  await dialog.getByRole("button", { name: /confirm/i }).click({ timeout: ACTION_TIMEOUT });
  await expect(page.getByText(/(?:User|Users)\s+Deleted/i)).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
}

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
    // Re-prepare on every attempt (including Playwright retries) so a prior
    // partial run cannot leave the developer blocked or deleted.
    await prepareTestUser(page, "developer");

    await loginAsAdmin(page);
    await openUserAdminArea(page);

    // Block/unblock via per-row buttons (stable). Bulk-delete via Multibutton.
    // (admins cannot be blocked/deleted; developer@example.com is non-admin)
    await runRowUserAction(page, "block");
    await runRowUserAction(page, "unblock");
    await bulkDeleteDeveloper(page);
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
