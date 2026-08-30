/**
 * @file user.spec.ts
 * @description Enterprise-grade E2E tests for user profile management.
 * Refactored to use standard authentication patterns and robust locators.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_CREDENTIALS, TEST_API_HEADERS } from "../../helpers/api";
import { loginAsAdmin } from "../../helpers/auth";
import { dismissCookieConsent } from "../../helpers/cookie-consent";
import { confirmModal } from "../../helpers/confirm-modal";
import { expectToast } from "../../helpers/stable";
import { openUserManagement } from "../../helpers/user-page";

/**
 * Restore the deterministic admin fixture (`admin` username + password) via
 * the idempotent testing-API seed (update-by-email, never wipes). Lives in a
 * helper so cleanup blocks never throw lexically inside `finally`.
 */
async function reseedAdminFixture(page: Page): Promise<void> {
  const res = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "seed",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    },
  });
  if (!res.ok()) {
    throw new Error(`admin re-seed cleanup failed: HTTP ${res.status()}`);
  }
}

// Construct reliable file path for CI/CD environments
// The shared test thumbnail lives at the e2e root (tests/e2e/testthumb.png),
// committed to the repo so CI has it. Resolve it relative to this spec file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_PATH = path.join(__dirname, "..", "..", "testthumb.png");

// Run tests serially: Edit Avatar and Delete Avatar share the admin's avatar
// state, so they must not race each other (Delete Avatar needs a custom avatar
// that Edit Avatar uploads).
test.describe.serial("User Profile Management", () => {
  // 1. Setup: Run before every test in this group
  test.beforeEach(async ({ page }) => {
    // Perform Login
    await loginAsAdmin(page);

    // Verification: Wait for dashboard/collections to ensure we are logged in
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("Login Verification", async ({ page }) => {
    // Already verified in beforeEach, but good for sanity check
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    // Navigate to user profile page and verify it loads
    await page.goto("/user");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10_000 });
    // Also verify page body is visible as a secondary check
    await expect(page.locator("body")).toBeVisible({ timeout: 5_000 });
  });

  test("Workspace Appearance link opens appearance config", async ({ page }) => {
    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page).toHaveURL(/\/user/, { timeout: 15_000 });

    // Fail fast if the root error boundary fired (same class of flake as account-smoke)
    const systemError = page.getByRole("heading", { name: /system error/i });
    if (await systemError.isVisible({ timeout: 1_500 }).catch(() => false)) {
      const detail = await page
        .locator(".font-mono, pre, code")
        .first()
        .textContent()
        .catch(() => "");
      throw new Error(`User profile hit System Error boundary: ${detail?.trim() || "(no detail)"}`);
    }

    // Prefer attached over visible: Preferences can sit below fold / inside overflow shells
    // where Playwright treats clipped nodes as not visible even though they are in the DOM.
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: 15_000 });

    // Click the Settings tab (retry until active — the tab is SSR-rendered before
    // hydration attaches its onclick, so a one-shot click can be a silent no-op).
    await dismissCookieConsent(page);
    const settingsTab = page.getByRole("tab", { name: /settings/i });
    await expect(settingsTab).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      if ((await settingsTab.getAttribute("aria-selected")) !== "true") {
        await settingsTab.click({ timeout: 10_000 });
      }
      await expect(settingsTab).toHaveAttribute("aria-selected", "true", { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId("user-settings-panel")).toBeVisible({ timeout: 10_000 });

    // Compact density/card strip on Settings
    await expect(page.getByTestId("user-quick-appearance")).toBeVisible({ timeout: 10_000 });

    const openLink = page.getByTestId("open-appearance-settings-btn");
    await expect(openLink).toBeAttached({ timeout: 20_000 });
    await expect(openLink).toHaveAttribute("href", /\/config\/design-system(\?tab=overrides)?/);

    // Navigate via the real href (SPA-safe); force-click as fallback if layout intercepts
    await openLink.scrollIntoViewIfNeeded().catch(() => {});
    await Promise.all([
      page.waitForURL(/\/config\/design-system/, { timeout: 20_000 }),
      openLink.click({ force: true }),
    ]).catch(async () => {
      // Last resort: follow href attribute directly (still validates the link target)
      const href = await openLink.getAttribute("href");
      if (!href) throw new Error("open-appearance-settings-btn missing href");
      await page.goto(href, { waitUntil: "domcontentloaded" });
    });

    await expect(page).toHaveURL(/\/config\/design-system/, { timeout: 15_000 });
    await expect(
      page
        .getByRole("heading", { level: 1, name: /design system/i })
        .or(page.getByRole("heading", { name: /my overrides/i }))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("Edit Avatar", async ({ page }) => {
    // Fixture is committed to the repo — a missing file is a broken checkout,
    // not a reason to soft-skip (control-map row; soft-skips are banned).
    expect(fs.existsSync(AVATAR_PATH), `Avatar fixture missing: ${AVATAR_PATH}`).toBe(true);

    await page.goto("/user");

    // Wait for profile to load
    await expect(page.getByRole("heading", { level: 1, name: "User Profile" })).toBeVisible();

    // Trigger upload — the Edit Avatar button is an absolutely-positioned overlay
    // that Playwright's viewport check rejects even with force:true, so dispatch
    // a native DOM click. SSR renders the pencil button before Svelte attaches
    // its onclick, so a single dispatch can be a silent no-op — drive the modal
    // open with an outcome-based retry instead.
    const editAvatarBtn = page.getByRole("button", { name: "Edit Avatar" });
    const avatarModal = page.locator(".modal-avatar").first();
    await expect(async () => {
      await editAvatarBtn.evaluate((el: HTMLElement) => el.click());
      await expect(avatarModal).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // Handle file input safely — the modal is confirmed open above
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    await fileInput.setInputFiles(AVATAR_PATH);

    // Selecting a file only enables Save — the upload runs on form submit (no auto-upload).
    const saveBtn = page.getByRole("button", { name: /^save$/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // A "Replace Avatar" confirm appears when a custom avatar already exists (retry safety)
    const confirmBtn = page.getByRole("button", { name: /confirm/i });
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Upload outcome: the success toast is the real signal (the sidebar avatar img must
    // NOT be used as a fallback — it matches even when no upload happened).
    await expect(page.getByText(/avatar updated successfully/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Delete Avatar", async ({ page }) => {
    await page.goto("/user");

    // Wait for profile to load (matches the passing "Edit Avatar" test)
    await expect(page.getByRole("heading", { level: 1, name: "User Profile" })).toBeVisible();

    // The "Delete Avatar" button only renders when a custom avatar is set
    // (page.data.user.avatar !== '/Default_User.svg'). Edit Avatar (which runs
    // before this test in serial mode) uploads one — so absence here is a REAL
    // regression, not a reason to soft-skip (control-map row; soft-skips banned).
    // Same hydration-race guard as Edit Avatar: the fresh page load renders the
    // pencil button before hydration attaches the onclick, so retry the native
    // click until the avatar modal actually opens.
    const editAvatarBtn = page.getByRole("button", { name: "Edit Avatar" });
    const avatarModal = page.locator(".modal-avatar").first();
    await expect(async () => {
      await editAvatarBtn.evaluate((el: HTMLElement) => el.click());
      await expect(avatarModal).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    const deleteBtn = avatarModal.getByRole("button", { name: "Delete Avatar" });
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    // Confirmation dialog appears — use the stable testid-backed confirm helper
    // (AGENTS.md pitfall #13: the portal render gap means the dialog shell can be
    // visible before content; a page-wide /confirm/i can also collide with other
    // "Confirm" buttons).
    await confirmModal(page);

    // Assertion: a custom avatar is gone — the success toast "Avatar Deleted"
    // appears and the profile avatar returns to the default initials state. Scope
    // the toast via the shared toast/role=alert locator, then the avatar button.
    await expectToast(page, /avatar deleted/i);
    const profileAvatar = page.getByTestId("edit-avatar-btn").getByRole("img").first();
    await expect(profileAvatar).toBeVisible();
  });

  test("Edit User Details", async ({ page }) => {
    // This test renames the admin user — it MUST restore the deterministic
    // `admin` fixture afterwards (seed is idempotent, updates by email, never
    // wipes) or the mutation leaks into other specs that assume `admin`.
    let cleanupError: unknown = null;
    try {
      await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect(page).toHaveURL(/\/user/, { timeout: 15_000 });

      await page
        .getByTestId("edit-user-settings-btn")
        .or(page.getByRole("button", { name: /Edit User Settings/i }))
        .first()
        .click();

      // Scope to the edit dialog so Save/username resolve unambiguously
      const editDialog = page
        .getByRole("dialog", { name: /Edit User Data|edit user/i })
        .or(page.getByRole("dialog").filter({ hasText: /username/i }))
        .first();
      await expect(editDialog).toBeVisible({ timeout: 15_000 });

      // Unique username each run — avoids uniqueness validation failures
      const newUsername = `TestUser_${Date.now().toString(36).slice(-6)}`;
      const usernameInput = editDialog.locator('input[name="username"]:not([disabled])');
      await expect(usernameInput).toBeVisible({ timeout: 10_000 });
      await usernameInput.fill(newUsername);

      const updateRespPromise = page
        .waitForResponse(
          (res) =>
            res.url().includes("/api/user/update-user-attributes") &&
            ["PUT", "POST", "PATCH"].includes(res.request().method()),
          { timeout: 15_000 },
        )
        .catch(() => null);

      await editDialog.getByRole("button", { name: /^save$/i }).click();

      const updateResp = await updateRespPromise;
      if (updateResp && !updateResp.ok()) {
        const body = await updateResp.text().catch(() => "");
        throw new Error(
          `update-user-attributes failed: HTTP ${updateResp.status()} ${body.slice(0, 300)}`,
        );
      }

      // Prefer outcome over toast flash: dialog closes, username visible, or success toast
      const { expectToast } = await import("../../helpers/stable");
      await expect(async () => {
        const dialogGone = !(await editDialog.isVisible().catch(() => false));
        if (dialogGone) return;
        const usernameVisible = await page
          .getByText(newUsername, { exact: false })
          .first()
          .isVisible()
          .catch(() => false);
        if (usernameVisible) return;
        const errToast = page
          .getByTestId("app-toast")
          .filter({ hasText: /user not found|update failed|failed to update/i });
        if (
          await errToast
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          throw new Error(
            `Profile update failed: ${await errToast
              .first()
              .textContent()
              .catch(() => "error toast")}`,
          );
        }
        await expectToast(page, /user data updated|profile changes were saved/i, 2_000);
      }).toPass({ timeout: 20_000 });
    } finally {
      // Restore the `admin` username + fixture password (no username param →
      // `email.split("@")[0]` = "admin"). The seed failure must NOT mask the
      // main error (throwing inside finally is unsafe) — it is re-thrown
      // after the block, which only runs when the main body succeeded.
      try {
        await reseedAdminFixture(page);
      } catch (cleanupErr) {
        cleanupError = cleanupErr;
        console.warn(`[profile.spec] admin re-seed cleanup failed: ${cleanupErr}`);
      }
    }
    // Only reachable when the main body passed — fail loudly on cleanup.
    if (cleanupError) throw cleanupError;
  });

  test("Registration Token Workflow", async ({ page }) => {
    await page.goto("/user");

    // The email-registration-token control lives in the User Management tab.
    await openUserManagement(page);

    await page.getByRole("button", { name: /Email User Registration token/i }).click();

    // Scoped to the token dialog
    const tokenDialog = page.getByRole("dialog", { name: /Edit Token Data/i });
    await expect(tokenDialog).toBeVisible({ timeout: 10_000 });

    // Unique email per run — a fixed address collides on reruns/retries
    // (duplicate invite email), failing the control row.
    await tokenDialog
      .locator('input[name="email"]:not([disabled])')
      .fill(`regtoken_${Date.now()}@test.ge`);

    // Select Role — chip buttons inside the dialog (role names: admin/developer/editor/user)
    const roleChip = tokenDialog.getByRole("button", { name: /^user$/i });
    if (await roleChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleChip.click();
    }

    // Select Duration
    await tokenDialog.locator("#expires-select").selectOption("12 hrs");

    await tokenDialog.getByRole("button", { name: "Save" }).click();

    // After success the modal stays open and renders an "Invitation Token Created"
    // panel with the copyable invite link. Assert on that heading (scoped to the
    // dialog) — a global getByText(/Token Created/i) also matches the toast and
    // the success toast title, causing a strict-mode violation.
    await expect(
      tokenDialog.getByRole("heading", { name: /Invitation Token Created/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Toggle User Token Visibility", async ({ page }) => {
    await page.goto("/user");

    // Token view lives inside the User Management tab.
    await openUserManagement(page);

    // Switch to Invitations tab
    const tokensTab = page.getByTestId("admin-tab-tokens");
    await expect(tokensTab).toBeVisible({ timeout: 10_000 });
    await tokensTab.click();

    // Verify token table is visible
    const tokenTable = page.locator("table");
    await expect(tokenTable).toBeVisible({ timeout: 10_000 });

    // Switch back to Users tab
    const usersTab = page.getByTestId("admin-tab-users");
    await usersTab.click();
    await expect(usersTab).toHaveAttribute("aria-selected", "true");
  });

  test("Toggle User List Visibility", async ({ page }) => {
    await page.goto("/user");

    // User list view lives inside the User Management tab.
    await openUserManagement(page);

    // Users tab should be active by default
    const usersTab = page.getByTestId("admin-tab-users");
    await expect(usersTab).toBeVisible({ timeout: 10_000 });
    await expect(usersTab).toHaveAttribute("aria-selected", "true");

    // Verify user table is visible
    const userTable = page.locator("table");
    await expect(userTable).toBeVisible({ timeout: 10_000 });

    // Switch to Invitations tab
    const tokensTab = page.getByTestId("admin-tab-tokens");
    await tokensTab.click();
    await expect(tokensTab).toHaveAttribute("aria-selected", "true");
  });
});
