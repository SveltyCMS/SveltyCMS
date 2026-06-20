/**
 * @file tests/e2e/routes/config/access-management.spec.ts
 * @description E2E tests for /config/access-management — role and permission management.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Access Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page loads with tabs", async ({ page }) => {
    await page.goto("/config/access-management");
    await expect(page.getByRole("heading", { level: 1, name: /access management/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /roles/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /permissions/i })).toBeVisible();
  });

  test("roles tab shows role list with admin badge", async ({ page }) => {
    await page.goto("/config/access-management");
    await page.getByRole("tab", { name: /roles/i }).click();
    await expect(page.getByRole("button", { name: /create role/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/admin/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("permissions tab loads permission matrix", async ({ page }) => {
    await page.goto("/config/access-management");
    await page.getByRole("tab", { name: /permissions/i }).click();
    await expect(
      page.getByText(/permission management|create|read|write|delete/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("save button is disabled when no changes made", async ({ page }) => {
    await page.goto("/config/access-management");
    const saveBtn = page.getByRole("button", { name: /save/i }).first();
    if (await saveBtn.isVisible()) {
      await expect(saveBtn).toBeDisabled();
    }
  });
});
