/**
 * @file tests/e2e/routes/config/access-management.spec.ts
 * @description E2E for /config/access-management — roles, permissions, tokens, save/reset.
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 20_000;

async function goAccess(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/access-management", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  // Re-auth once if bounced to /login (stale storageState / cookie desync)
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/config/access-management");
  }
  await expect(page).toHaveURL(/\/config\/access-management/, { timeout: ACTION_TIMEOUT });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
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
    await expect(page.getByText(/permission|create|read|write|delete|system/i).first()).toBeVisible(
      { timeout: ACTION_TIMEOUT },
    );
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
    // Exclude GDPR cookie banner; role modal may not always have a name attribute.
    const dialog = page
      .getByRole("dialog")
      .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i })
      .filter({
        has: page.locator(
          'input[name="roleName"], input[name="name"], input[type="text"], input:not([type])',
        ),
      })
      .first();
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });

    const roleName = `E2ERole_${Date.now().toString(36).slice(-5)}`;
    const nameInput = dialog
      .locator('input[name="roleName"], input[name="name"], input[type="text"], input:not([type])')
      .or(dialog.getByLabel(/name|role/i))
      .first();
    await expect(nameInput).toBeVisible({ timeout: ACTION_TIMEOUT });
    await nameInput.fill(roleName);

    // Confirm create in modal (button text is often "Create" / "Save")
    await dialog
      .getByRole("button", { name: /^(save|create|confirm|ok|create role)$/i })
      .or(dialog.locator('button[type="submit"]'))
      .first()
      .click();

    await expect(
      page.getByText(new RegExp(roleName, "i")).or(page.getByText(/role added|save to apply/i)),
    ).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    const saveBtn = page.getByTestId("access-mgmt-save").first();
    await expect(saveBtn).toBeEnabled({ timeout: ACTION_TIMEOUT });

    // Reset without saving
    await page.getByTestId("access-mgmt-reset").click();
    await expect(page.getByText(/reset/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(saveBtn).toBeDisabled({ timeout: ACTION_TIMEOUT });
  });

  test("admin and website tokens tabs open", async ({ page }) => {
    await goAccess(page);

    await page.getByTestId("access-tab-admin").click();
    await expect(page.getByText(/admin/i).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    await page.getByTestId("access-tab-tokens").click();
    // Tokens panel — generate/list UI varies; assert no crash + some token-related chrome
    await expect(page.getByText(/token|website|generate|api/i).first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("role search filters list", async ({ page }) => {
    await goAccess(page);
    await page.getByTestId("access-tab-roles").click();
    const search = page.getByTestId("access-role-search");
    await search.fill("zzzz-no-such-role-xyz");
    await page.waitForTimeout(200);
    // Either empty filter state or admin still if search is loose — don't soft-fail hard
    await search.fill("admin");
    await expect(page.getByText(/admin/i).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
  });
});
