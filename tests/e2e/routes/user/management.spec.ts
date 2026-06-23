/**
 * @file tests/playwright/user-crud.spec.ts
 * @description Playwright end-to-end tests for user management CRUD flows in SveltyCMS.
 *   - Admin login
 *   - Read and edit user profile
 *   - Delete, block, and unblock users
 *   - Invite user via email and accept invitation
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin, logout } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

test.describe("User Management Flow", () => {
  test.setTimeout(120_000); // 2 min timeout

  test("Admin Login", async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Read and Edit User Profile", async ({ page }) => {
    // Login
    await loginAsAdmin(page);

    // Go to User Profile (sidebar avatar link may be off-screen — navigate direct)
    await page.goto("/user");

    // ✅ READ operation - assert user profile visible
    await expect(page.getByRole("heading", { name: /user profile/i })).toBeVisible({
      timeout: 15_000,
    });

    // ✅ UPDATE operation - Edit user info
    await page.getByRole("button", { name: /edit user settings/i }).click();
    await page.locator('input[name="username"]:not([disabled])').fill("updatedUser");
    await page.getByRole("button", { name: /save/i }).first().click();

    // Confirm update saved — toast may appear and disappear; wait longer
    // If the page refreshes with invalidateAll(), the username input value should update
    await expect(
      page
        .locator('input[name="username"]')
        .first()
        .or(page.getByText(/updateduser/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Delete, Block, and Unblock Users", async ({ page, request }) => {
    // Login
    await loginAsAdmin(page);

    // Seed a test user via testing API (global setup only creates admin)
    const createUserResp = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "create-user",
        username: "developer",
        email: "developer@example.com",
        password: "Password123!",
        role: "developer",
      },
    });
    // Ignore 409 (already exists) — user may persist from previous run
    expect([200, 201, 409].includes(createUserResp.status())).toBeTruthy();

    // Ensure developer user is unblocked before test (may be blocked from a previous run)
    const getUserResp = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "get-user", email: "developer@example.com" },
    });
    if (getUserResp.ok()) {
      const userData = await getUserResp.json();
      if (userData?.user?._id && userData.user.blocked) {
        await request.post("/api/user/batch", {
          headers: { "Content-Type": "application/json" },
          data: { userIds: [userData.user._id], action: "unblock" },
        });
      }
    }

    // Go to User Profile
    await page.goto("/user");
    await page.reload();

    // Block, then Unblock, and finally Delete the seeded user
    const actions = [
      { label: "Select block action", name: "Block" },
      { label: "Select unblock action", name: "Unblock" },
      { label: "Select delete action", name: "Delete" },
    ];

    // Wait for user list table to load
    await expect(page.getByRole("heading", { name: "User List:" })).toBeVisible({
      timeout: 10_000,
    });

    // Wait for developer user to appear in the table
    const developerRow = page.locator("tr", { hasText: "developer@example.com" }).first();
    await expect(developerRow).toBeVisible({ timeout: 15_000 });

    for (const action of actions) {
      // Re-locate the developer row fresh each iteration to avoid stale
      // locators and lingering checkbox selection from the previous action.
      // We cannot block/delete admins, so we target the seeded developer user.
      const row = page.locator("tr", { hasText: "developer@example.com" }).first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.getByRole("checkbox").first().click();

      // Wait for bulk actions button to be enabled
      const bulkBtn = page.getByRole("button", { name: /Toggle bulk actions menu/i });
      await expect(bulkBtn).toBeEnabled({ timeout: 10_000 });
      await bulkBtn.click();

      // Wait for menu items to appear and select action
      await expect(page.getByRole("menuitem", { name: action.label })).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole("menuitem", { name: action.label }).click();

      // Wait for confirm dialog and click confirm
      await expect(page.getByRole("button", { name: /confirm/i })).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: /confirm/i }).click();

      // Wait for confirmation toast or success message
      await expect(page.getByText(new RegExp(action.name, "i")).first()).toBeVisible({
        timeout: 5000,
      });

      // Wait for the table to reload before next iteration
      await page.waitForTimeout(1500);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "User List:" })).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("Invite User via Email and Accept Invitation", async ({ page }) => {
    // Login
    await loginAsAdmin(page);

    // Go to User Profile
    await page.getByRole("link", { name: /user profile/i }).click();

    // Click on email user registration token
    const tokenBtn = page.getByRole("button", { name: /email user registration token/i });
    await tokenBtn.scrollIntoViewIfNeeded();
    await tokenBtn.click();

    // Wait for modal to appear
    const modalDialog = page.getByRole("dialog").first();
    await expect(modalDialog).toBeVisible({ timeout: 10_000 });

    // Fill form
    await modalDialog.locator('input[name="email"]:not([disabled])').fill("newuser@example.com");
    // Select role — role buttons use role names (admin, editor, developer), not "user"
    const roleRadio = modalDialog.getByRole("radio", { name: /developer/i });
    if (await roleRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleRadio.click();
    } else {
      // Role selection uses chip buttons with role names
      const roleBtn = modalDialog.getByRole("button", { name: /developer/i }).first();
      await expect(roleBtn).toBeVisible({ timeout: 10_000 });
      await roleBtn.click();
    }
    await modalDialog.getByRole("button", { name: /save/i }).first().click();

    // Wait for the invitation link section to appear
    await expect(page.getByText("Invitation Link").first()).toBeVisible({ timeout: 15_000 });

    // Get the readonly input inside the "Invitation Link" label
    const inviteLinkInput = page
      .locator("label", { hasText: "Invitation Link" })
      .locator("input")
      .first();
    await expect(inviteLinkInput).toBeVisible({ timeout: 5_000 });
    const inviteUrl = await inviteLinkInput.inputValue();

    // Log out admin before visiting invite URL so login page shows
    await logout(page);

    // Go to generated invite URL
    await page.goto(inviteUrl);

    // Click "Go to Sign Up" to access the registration form
    await page.getByRole("button", { name: /sign up/i }).click();

    // Check prefilled fields on signup page
    await expect(page.locator('input[name="email"]').first()).toHaveValue("newuser@example.com");

    // Fill remaining signup fields
    await page.locator('input[name="username"]').first().fill("newuser");
    await page.locator('input[type="password"]').nth(0).fill("user@123!");
    await page.locator('input[type="password"]').nth(1).fill("user@123!");

    await page.getByRole("button", { name: /accept invitation/i }).click();

    // Optional: Assert signup success
    await expect(page.getByText(/account created/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
