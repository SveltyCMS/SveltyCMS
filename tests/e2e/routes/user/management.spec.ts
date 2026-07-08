/**
 * @file tests/e2e/routes/user/management.spec.ts
 * @description Playwright end-to-end tests for user management CRUD flows in SveltyCMS.
 *
 * Covers:
 * - Admin login.
 * - Reading and editing the current user profile.
 * - Blocking, unblocking, and deleting a non-admin user.
 * - Creating and accepting an email invitation.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

function projectSlug(projectName: string) {
  return projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function createTestUser(page: Page, email: string, role = "Author") {
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "create-user",
      email,
      password: "Password123!",
      role,
    },
  });

  expect(response.ok()).toBeTruthy();
}

async function waitForSystemReady(page: Page) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/user?page=1&limit=1");
        return response.status();
      },
      {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000, 5_000],
      },
    )
    .toBe(200);
}

test.describe("User Management Flow", () => {
  test.setTimeout(120_000);

  test("Admin Login", async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Read and Edit User Profile", async ({ page }) => {
    await loginAsAdmin(page);
    await waitForSystemReady(page);

    await page.getByRole("link", { name: /user profile/i }).click();
    await expect(page.getByRole("heading", { level: 1, name: /user profile/i })).toBeVisible();

    await page.getByRole("button", { name: /edit user settings/i }).click();
    const userDialog = page.getByRole("dialog", { name: /edit user data/i });
    await expect(userDialog).toBeVisible({ timeout: 10_000 });
    await userDialog.locator('input[name="username"]:not([disabled])').fill("updatedUser");
    await userDialog.getByRole("button", { name: /^save$/i }).click();

    await expect(page.getByText(/user data updated/i)).toBeVisible({ timeout: 10_000 });
    await expect(userDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main input[name="username"][disabled]')).toHaveValue("updatedUser", {
      timeout: 10_000,
    });
  });

  test("Delete, Block, and Unblock Users", async ({ page }, testInfo) => {
    const targetEmail = `bulk-${projectSlug(testInfo.project.name)}@example.com`;

    await loginAsAdmin(page);
    await createTestUser(page, targetEmail);

    await page.getByRole("link", { name: /user profile/i }).click();

    const actions = ["Block", "Unblock", "Delete"];

    for (const action of actions) {
      const row = page.locator("tbody tr", { hasText: targetEmail });
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.getByRole("checkbox").first().click();

      await page.getByRole("button", { name: /toggle bulk actions menu/i }).click();
      await page
        .getByRole("menuitem", { name: new RegExp(`select ${action.toLowerCase()} action`, "i") })
        .click();
      await page.getByRole("button", { name: /confirm/i }).click();

      if (action === "Block") {
        await expect(row.getByRole("button", { name: /click to unblock user/i })).toBeVisible({
          timeout: 10_000,
        });
      } else if (action === "Unblock") {
        await expect(row.getByRole("button", { name: /click to block user/i })).toBeVisible({
          timeout: 10_000,
        });
      } else {
        await expect(row).toHaveCount(0, { timeout: 10_000 });
      }
    }

    await expect(page.locator("tbody tr", { hasText: targetEmail })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("Invite User via Email and Accept Invitation", async ({ page }, testInfo) => {
    const slug = projectSlug(testInfo.project.name);
    const invitedEmail = `invite-${slug}@example.com`;

    await loginAsAdmin(page);

    await page.getByRole("link", { name: /user profile/i }).click();
    await page.getByRole("button", { name: /email user registration token/i }).click();

    const tokenDialog = page.getByRole("dialog", { name: /edit token data/i });
    await expect(tokenDialog).toBeVisible({ timeout: 5_000 });
    await tokenDialog.locator('input[name="email"]:not([disabled])').fill(invitedEmail);
    await tokenDialog.getByRole("button", { name: /^editor$/i }).first().click();
    await tokenDialog.getByRole("button", { name: /^save$/i }).click();

    await expect(tokenDialog.getByText(/invitation token created/i)).toBeVisible({
      timeout: 10_000,
    });
    const inviteLinkInput = tokenDialog.locator("input[readonly]").first();
    await expect(inviteLinkInput).toBeVisible({ timeout: 10_000 });
    const inviteUrl = await inviteLinkInput.inputValue();
    expect(inviteUrl).toContain("invite_token=");

    await page.goto(inviteUrl);

    await expect(page.locator('input[name="email"]')).toHaveValue(invitedEmail);
    await expect(page.locator('input[name="token"]')).not.toHaveValue("");

    await page.fill('input[name="username"]', `invite-${slug}`);
    await page.fill('input[name="password"]', "Password123!");
    await page.fill('input[name="confirm_password"]', "Password123!");

    await page.getByRole("button", { name: /accept invitation/i }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
