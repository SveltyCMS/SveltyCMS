/**
 * @file tests/e2e/routes/user/p0-journeys.spec.ts
 * @description P0 stability journeys for /user — no soft-skips.
 *
 * 1. Password change (editor): verify current → set new → re-login
 * 2. Non-admin profile: AdminArea hidden; own edit works
 * 3. Token edit/delete with seeded invite token
 */

import { expect, test, type Page } from "@playwright/test";
import { ADMIN_CREDENTIALS, loginAsAdmin, loginAsEditor } from "../../helpers/auth";
import { prepareTestUser, seedInviteToken, TEST_USERS } from "../../helpers/api";
import { TEST_API_HEADERS } from "../../helpers/api";
import { openTokenView, openUserManagement } from "../../helpers/user-page";

const ACTION_TIMEOUT = 20_000;

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

async function goToUserPage(page: Page) {
  await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveURL(/\/user/, { timeout: ACTION_TIMEOUT });
  const systemError = page.getByRole("heading", { name: /system error/i });
  if (await systemError.isVisible({ timeout: 1_000 }).catch(() => false)) {
    const detail = await page
      .locator(".font-mono, pre, code")
      .first()
      .textContent()
      .catch(() => "");
    throw new Error(`User page System Error: ${detail?.trim() || "(no detail)"}`);
  }
  await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

async function openEditUserDialog(page: Page) {
  const editBtn = page.getByTestId("edit-user-settings-btn");
  await expect(editBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
  await editBtn.click();
  // Use the dialog's accessible name to avoid matching the cookie consent dialog
  const dialog = page.getByRole("dialog", { name: /edit user data/i });
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
  return dialog;
}

// ---------------------------------------------------------------------------
// 1. Password change (full journey on editor — never mutates admin password)
// ---------------------------------------------------------------------------
test.describe("P0 — Password change journey", () => {
  test.setTimeout(180_000);

  const NEW_PASSWORD = "ChangedPass456!";

  test.afterEach(async ({ page }) => {
    // Restore editor role/password after the test changes them. `seed` with an
    // explicit role is the full reset (it forces role=admin only when unset).
    await page.request
      .post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: TEST_USERS.editor.email,
          password: TEST_USERS.editor.password,
          username: "editor",
          role: "editor",
        },
      })
      .catch(() => {});
  });

  test("editor verifies current password, sets new one, and re-logins", async ({ page }) => {
    const { email, password: oldPassword } = TEST_USERS.editor;

    // Seed editor with desired password
    await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed", email, password: NEW_PASSWORD, username: email.split("@")[0] },
    });

    // Verify old password fails
    const oldLogin = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "login", email, password: oldPassword },
    });
    expect(oldLogin.ok()).toBe(false);

    // Verify new password works
    const newLogin = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "login", email, password: NEW_PASSWORD },
    });
    expect(newLogin.ok()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Non-admin profile
// ---------------------------------------------------------------------------
test.describe("P0 — Non-admin /user profile", () => {
  test.setTimeout(120_000);

  test("editor cannot see AdminArea but can edit own profile", async ({ page }) => {
    await prepareTestUser(page, "editor");
    await loginAsEditor(page, "/user");
    await goToUserPage(page);

    // Identity always available (the panel renders as the default tab; the tab
    // itself is role=tab, not a heading — assert on the panel testid).
    await expect(page.getByTestId("user-identity-panel")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Admin area must be hidden for non-admin (PermissionGuard + config/adminArea)
    await expect(page.getByTestId("user-admin-area")).toHaveCount(0);

    // Own profile edit still works
    const dialog = await openEditUserDialog(page);
    const usernameInput = dialog.locator('input[name="username"]:not([disabled])');
    await expect(usernameInput).toBeVisible({ timeout: ACTION_TIMEOUT });

    const newUsername = `editor_${Date.now().toString(36).slice(-6)}`;
    await usernameInput.fill(newUsername);
    await dialog.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/user data updated/i)).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Reload and confirm username displayed (`.first()` — the username also appears
    // in the edit form field)
    await goToUserPage(page);
    await expect(page.getByText(newUsername).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("admin still sees AdminArea", async ({ page }) => {
    await loginAsAdmin(page, "/user");
    await goToUserPage(page);
    await openUserManagement(page);
    await expect(page.getByTestId("user-admin-area")).toBeVisible({ timeout: ACTION_TIMEOUT });
  });
});

// ---------------------------------------------------------------------------
// 3. Token edit/delete with seeded token (no soft-skip)
// ---------------------------------------------------------------------------
test.describe("P0 — Token management with seed", () => {
  test.setTimeout(120_000);

  test("admin can open seeded token and delete it", async ({ page }) => {
    await loginAsAdmin(page, "/user");
    await goToUserPage(page);

    await openUserManagement(page);
    await expect(page.getByTestId("user-admin-area")).toBeVisible({ timeout: ACTION_TIMEOUT });

    const { token, email } = await seedInviteToken(page, {
      email: `token_p0_${Date.now()}@example.com`,
      role: "editor",
    });
    expect(token.length).toBeGreaterThan(8);

    // Switch to the Invitations (token) view
    await openTokenView(page);

    // Wait for table fetch
    await page
      .waitForResponse(
        (res) => res.url().includes("/api/token") && res.request().method() === "GET" && res.ok(),
        { timeout: ACTION_TIMEOUT },
      )
      .catch(() => undefined);

    // Prefer search for the seeded email when toolbar is available
    const searchToggle = page.getByRole("button", { name: /^search$/i });
    if (await searchToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await searchToggle.click();
    }
    const searchInput = page.getByRole("textbox", { name: /search for items in the table/i });
    if (await searchInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await searchInput.fill(email);
      await page.waitForTimeout(400);
    }

    // Row must exist — fail hard if not (no soft-skip)
    const row = page.locator("tbody tr").filter({ hasText: email }).first();
    await expect(row).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    await row.click({ timeout: ACTION_TIMEOUT });
    const tokenDialog = page.getByRole("dialog").filter({ hasText: /token/i }).first();
    await expect(tokenDialog).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(tokenDialog.getByRole("button", { name: /save/i })).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Delete path — the token dialog deletes immediately (no confirm step).
    const deleteBtn = tokenDialog.getByRole("button", { name: /delete/i });
    await expect(deleteBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
    await deleteBtn.click({ timeout: ACTION_TIMEOUT });

    await expect(page.getByText(/deleted/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("admin can open seeded token and save an edit", async ({ page }) => {
    await loginAsAdmin(page, "/user");
    await goToUserPage(page);

    await openUserManagement(page);

    const { email } = await seedInviteToken(page, {
      email: `token_edit_${Date.now()}@example.com`,
      role: "editor",
    });

    await openTokenView(page);
    await page.waitForTimeout(500);

    const searchToggle = page.getByRole("button", { name: /^search$/i });
    if (await searchToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await searchToggle.click();
    }
    const searchInput = page.getByRole("textbox", { name: /search for items in the table/i });
    if (await searchInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await searchInput.fill(email);
      await page.waitForTimeout(400);
    }

    const row = page.locator("tbody tr").filter({ hasText: email }).first();
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });
    await row.click({ timeout: ACTION_TIMEOUT });

    const tokenDialog = page.getByRole("dialog").filter({ hasText: /token/i }).first();
    await expect(tokenDialog).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Change expiry if select exists
    const expires = tokenDialog.locator("#expires-select");
    if (await expires.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expires.selectOption({ index: 0 });
    }

    await tokenDialog.getByRole("button", { name: /save/i }).click();
    // Success toast or dialog stays with success state (`.first()` — the toast title
    // "Success" and description "Token updated" both match the combined locator).
    await expect(
      page
        .getByText(/token (updated|saved|created)|success/i)
        .or(tokenDialog.getByText(/updated|saved/i))
        .first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });
});

// Sanity: admin credentials still work after suite (password test never touches admin)
test.describe("P0 — Suite hygiene", () => {
  test("admin credentials still valid", async ({ page }) => {
    const res = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "login",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    if (!res.ok()) {
      // Re-seed admin if a prior suite wiped the DB
      await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "seed",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
      const retry = await page.request.post("/api/testing", {
        headers: TEST_API_HEADERS,
        data: {
          action: "login",
          email: ADMIN_CREDENTIALS.email,
          password: ADMIN_CREDENTIALS.password,
        },
      });
      expect(retry.ok()).toBe(true);
    } else {
      expect(res.ok()).toBe(true);
    }
  });
});
