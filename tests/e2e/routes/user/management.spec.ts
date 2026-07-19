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
  await expect(page.getByTestId("user-admin-area")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await ensureUserListVisible(page);
  await expect(page.getByTestId("user-bulk-actions-menu")).toBeVisible({
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
      // Accept 1+ rows (seedTestUsers + prepareTestUser may create duplicates).
      // Use first() so row actions (block/unblock/delete) target a stable element.
      await expect(row.first()).toBeVisible({ timeout: ACTION_TIMEOUT });
      const count = await row.count();
      if (count !== 1) {
        console.log(`[developerRow] Found ${count} rows for ${DEVELOPER_EMAIL} — using first`);
      }
      return row.first();
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

  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: /confirm|block|unblock/i })
    .first();
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

  const bulkMenu = page.getByTestId("user-bulk-actions-menu");
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
    // Force landing on a protected route so public "/" cannot false-positive
    await loginAsAdmin(page, "/user");
    await expect(page).toHaveURL(/\/user/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
    // Accept any admin page content as success (dashboard, collections, etc.)
    await expect(page.locator("body")).not.toHaveText(/sign in/i, { timeout: 5_000 });
  });

  test("Read and Edit User Profile", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page).toHaveURL(/\/user/, { timeout: 15_000 });

    // Fail fast if the root error boundary rendered
    const systemError = page.getByRole("heading", { name: /system error/i });
    if (await systemError.isVisible({ timeout: 1_500 }).catch(() => false)) {
      const detail = await page
        .locator(".font-mono, pre, code")
        .first()
        .textContent()
        .catch(() => "");
      throw new Error(`User profile hit System Error boundary: ${detail?.trim() || "(no detail)"}`);
    }

    // ✅ READ — PageTitle testid (not fragile a11y name with nested controls)
    const pageTitle = page.getByTestId("page-title");
    await expect(pageTitle).toBeVisible({ timeout: 15_000 });
    await expect(pageTitle).toContainText(/user profile|benutzerprofil/i);
    await expect(page.getByRole("heading", { name: /^identity$/i })).toBeVisible({
      timeout: 10_000,
    });

    // ✅ UPDATE — stable testid on Identity "Edit User Settings" button
    const editBtn = page.getByTestId("edit-user-settings-btn");
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    const editDialog = page
      .getByRole("dialog")
      .filter({ hasText: /edit user data|username/i })
      .first();
    await expect(editDialog).toBeVisible({ timeout: 15_000 });

    // usernameSchema: no spaces — use a unique valid value each run
    const newUsername = `updatedUser_${Date.now().toString(36).slice(-6)}`;
    const usernameInput = editDialog.locator('input[name="username"]:not([disabled])');
    await expect(usernameInput).toBeVisible({ timeout: 10_000 });
    await usernameInput.fill(newUsername);

    await editDialog.getByRole("button", { name: /^save$/i }).click();

    // Toast via role=alert / data-testid — not CSS classes or icon markup
    const { expectToast } = await import("../../helpers/stable");
    await expectToast(page, /user data updated|profile changes were saved/i, 15_000);
  });

  test("Delete, Block, and Unblock Users", async ({ page }) => {
    // Re-prepare on every attempt (including Playwright retries) so a prior
    // partial run cannot leave the developer blocked or deleted.
    await prepareTestUser(page, "developer");

    await loginAsAdmin(page);
    await openUserAdminArea(page);

    // Block/unblock via per-row buttons (stable). Bulk-delete via Multibutton.
    // (admins cannot be blocked/deleted; developer@test.com is non-admin)
    await runRowUserAction(page, "block");
    await runRowUserAction(page, "unblock");
    await bulkDeleteDeveloper(page);
  });
});
