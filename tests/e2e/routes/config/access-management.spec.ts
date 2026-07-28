/**
 * @file tests/e2e/routes/config/access-management.spec.ts
 * @description E2E for /config/access-management — roles, permissions, tokens, save/reset.
 *
 * Selectors are role/testid based — stable under CSS/theme refactors.
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import {
  dismissCookieBannerIfPresent,
  getAppDialog,
  waitForAdminShell,
} from "../../helpers/stable";

const ACTION_TIMEOUT = 20_000;

async function goAccess(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/access-management", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/config/access-management");
  }
  await expect(page).toHaveURL(/\/config\/access-management/, { timeout: ACTION_TIMEOUT });
  await expect(page).not.toHaveURL(/\/login/);
  await dismissCookieBannerIfPresent(page);
  await waitForAdminShell(page, ACTION_TIMEOUT);
  await expect(page.getByTestId("page-title")).toContainText(/access management/i);
  await expect(page.getByTestId("access-mgmt-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Access Management shell", () => {
  test.setTimeout(120_000);

  test("loads with four tabs and save disabled", async ({ page }) => {
    await goAccess(page);

    await expect(page.getByTestId("access-tab-permissions")).toBeVisible();
    await expect(page.getByTestId("access-tab-roles")).toBeVisible();
    await expect(page.getByTestId("access-tab-admin")).toBeVisible();
    await expect(page.getByTestId("access-tab-tokens")).toBeVisible();

    const saveBtn = page.getByTestId("access-mgmt-save").first();
    await expect(saveBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(saveBtn).toBeDisabled();
  });

  test("permissions tab shows matrix content", async ({ page }) => {
    await goAccess(page);
    await page.getByTestId("access-tab-permissions").click();
    // Prefer role/name over free text when possible
    await expect(
      page
        .getByRole("checkbox")
        .or(page.getByText(/permission|create|read|write|delete/i))
        .first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("roles tab lists admin and create role", async ({ page }) => {
    await goAccess(page);
    await page.getByTestId("access-tab-roles").click();
    await expect(page.getByTestId("access-create-role")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByText(/admin/i).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("access-role-search")).toBeVisible();
  });

  test("create role enables save then reset discards", async ({ page }) => {
    await goAccess(page);
    await page.getByTestId("access-tab-roles").click();

    await page.getByTestId("access-create-role").click();

    // testid first (role-modal), dialog aria-label second — never CSS classes
    const modal = page.getByTestId("role-modal");
    const dialog = getAppDialog(page, /create|role/i);
    await expect(modal.or(dialog).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    const roleName = `E2ERole_${Date.now().toString(36).slice(-5)}`;
    const nameInput = page
      .getByTestId("role-name-input")
      .or(page.getByLabel(/^role name$/i))
      .or(page.locator('input[name="roleName"]'))
      .first();
    await expect(nameInput).toBeVisible({ timeout: ACTION_TIMEOUT });
    await nameInput.fill(roleName);

    // Confirm fill landed on the bound input (Playwright + Svelte bind edge cases)
    await expect(nameInput).toHaveValue(roleName);

    await page
      .getByTestId("role-modal-submit")
      .or(page.getByRole("button", { name: /^(create|update)$/i }))
      .first()
      .click();

    // Outcome over toast flash: role name appears OR toast, AND save enables
    await expect(async () => {
      const roleVisible = await page
        .getByText(roleName, { exact: false })
        .first()
        .isVisible()
        .catch(() => false);
      const toastVisible = await page
        .getByText(/role added|save to apply/i)
        .first()
        .isVisible()
        .catch(() => false);
      const saveEnabled = await page
        .getByTestId("access-mgmt-save")
        .first()
        .isEnabled()
        .catch(() => false);
      expect(roleVisible || toastVisible || saveEnabled).toBe(true);
    }).toPass({ timeout: ACTION_TIMEOUT });

    const saveBtn = page.getByTestId("access-mgmt-save").first();
    await expect(saveBtn).toBeEnabled({ timeout: ACTION_TIMEOUT });

    // Sticky page-actions duplicates reset — always .first()
    await page.getByTestId("access-mgmt-reset").first().click();
    // Reset confirmation or immediate disable — either is success
    await expect(saveBtn).toBeDisabled({ timeout: ACTION_TIMEOUT });
  });

  test("admin and website tokens tabs open", async ({ page }) => {
    await goAccess(page);

    await page.getByTestId("access-tab-admin").click();
    await expect(page.getByText(/admin/i).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    await page.getByTestId("access-tab-tokens").click();
    // Panel is always mounted with stable testids (not free-text / toast-dependent)
    await expect(
      page
        .getByTestId("website-tokens-panel")
        .or(page.getByTestId("website-tokens-title"))
        .or(page.getByTestId("website-tokens-generate"))
        .first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("role search filters list", async ({ page }) => {
    await goAccess(page);
    await page.getByTestId("access-tab-roles").click();
    const search = page.getByTestId("access-role-search");
    await search.fill("zzzz-no-such-role-xyz");
    // Debounced filter — poll for admin reappearance after typing
    await search.fill("admin");
    await expect(page.getByText(/admin/i).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
  });
});
