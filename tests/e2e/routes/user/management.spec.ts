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
import { prepareTestUser, seedTestUsers, TEST_USERS } from "../../helpers/api";
import { openUserManagement } from "../../helpers/user-page";

const DEVELOPER_EMAIL = TEST_USERS.developer.email;
const ACTION_TIMEOUT = 15_000;

/** Open /user and wait until the admin user table is interactive. */
async function openUserAdminArea(page: Page) {
  await page.goto("/user", { waitUntil: "domcontentloaded" });
  // AdminArea renders inside the "User Management" tab (Identity is the default).
  await openUserManagement(page);
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
    await checkbox.check({ force: true, timeout: ACTION_TIMEOUT });
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

  // Target the block/unblock confirm dialog by content — getByRole("dialog").first()
  // can match the cookie-consent banner that portals ahead of the confirm dialog.
  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: /Please Confirm User/i })
    .first();
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
  // Scope the confirm to the dialog — a page-first /confirm|block/i locator also
  // matches the admin-area toolbar buttons (which precede the portal in the DOM)
  // and would click the wrong control. The dialog may have a render gap, so wait
  // for the button inside it.
  const confirmBtn = dialog
    .getByRole("button", { name: /confirm|yes|ok|block|unblock/i })
    .or(dialog.locator("button").filter({ hasText: /confirm/i }))
    .first();
  await expect(confirmBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
  await confirmBtn.scrollIntoViewIfNeeded();
  await confirmBtn.click({ force: true, timeout: ACTION_TIMEOUT });

  // Verify the success toast (batch API is fire-and-forget with CSRF)
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
  // Select WITH search: the user Multibutton gates delete on systemUserCount (all
  // users), not the filtered totalItems, so a filtered selection stays enabled —
  // and the developer row is only visible on page 1 when searched.
  await selectDeveloperRow(page, { useSearch: true });

  const bulkMenu = page.getByTestId("user-bulk-actions-menu");
  await expect(bulkMenu).toBeEnabled({ timeout: ACTION_TIMEOUT });

  const executeDelete = page.getByRole("button", { name: "Execute Delete action" });
  if (await executeDelete.isEnabled({ timeout: 2_000 }).catch(() => false)) {
    await executeDelete.click({ timeout: ACTION_TIMEOUT });
  } else {
    // The Multibutton defaults to the "Edit" action, so the dropdown is the only
    // path to Delete. The SmartTable body overlays the open dropdown visually
    // (z-index), so a plain click is blocked by pointer-interception — force-click
    // the item. Re-open the menu if it closed mid-interaction.
    await bulkMenu.click({ timeout: ACTION_TIMEOUT });
    await page.waitForTimeout(400);
    const deleteItem = page.getByRole("menuitem", { name: /select delete action/i });
    await expect(deleteItem).toBeVisible({ timeout: ACTION_TIMEOUT });
    if (!(await deleteItem.isVisible({ timeout: 1_000 }).catch(() => false))) {
      await bulkMenu.click({ timeout: ACTION_TIMEOUT });
      await page.waitForTimeout(400);
    }
    // Playwright coordinate clicks miss here (the SmartTable body overlays the
    // dropdown and it can close mid-action) — fire the handler directly.
    await deleteItem.evaluate((el) => (el as HTMLButtonElement).click());
  }

  // Target the delete-confirm dialog by content (avoids the cookie banner portal).
  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: /delete/i })
    .first();
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
  // Scope to the dialog — page-first /confirm|delete/i also matches toolbar buttons.
  const confirmBtn = dialog
    .getByRole("button", { name: /confirm|yes|ok|delete/i })
    .or(dialog.locator("button").filter({ hasText: /confirm/i }))
    .first();
  await expect(confirmBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
  await confirmBtn.scrollIntoViewIfNeeded();
  await confirmBtn.click({ force: true, timeout: ACTION_TIMEOUT });
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
    // Verify we're on the user page by checking the profile heading
    await expect(page.getByRole("heading", { name: /user profile/i })).toBeVisible({
      timeout: 10_000,
    });
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

    // ✅ READ — PageTitle testid (SSR-rendered, always visible)
    const pageTitle = page.getByTestId("page-title");
    await expect(pageTitle).toBeVisible({ timeout: 15_000 });
    await expect(pageTitle).toContainText(/user profile|benutzerprofil/i);

    // Hydration check: the identity panel only renders client-side after the app
    // mounts (root layout is ssr=false) — its presence IS the CSR signal. The page
    // has no "Identity" heading element; the panel testid is the contract.
    const identityPanel = page.getByTestId("user-identity-panel");
    const headingVisible = await identityPanel.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!headingVisible) {
      // Control-map row: the UI mutation must run — a hydration miss is a real
      // regression, not a reason to fall back to shell-only assertions.
      throw new Error("Identity tab failed to hydrate — control-map row must run the UI update");
    }

    // ✅ UPDATE via UI when identity tab is hydrated
    const editBtn = page.getByTestId("edit-user-settings-btn");
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    const editDialog = page
      .getByRole("dialog")
      .filter({ hasText: /edit user data|username/i })
      .first();
    await expect(editDialog).toBeVisible({ timeout: 15_000 });

    const newUsername = `updatedUser_${Date.now().toString(36).slice(-6)}`;
    const usernameInput = editDialog.locator('input[name="username"]:not([disabled])');
    await expect(usernameInput).toBeVisible({ timeout: 10_000 });
    await usernameInput.fill(newUsername);
    await editDialog.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/user data updated/i)).toBeVisible({ timeout: 15_000 });
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
