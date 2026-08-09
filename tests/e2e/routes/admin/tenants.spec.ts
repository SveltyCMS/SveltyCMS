/**
 * @file tests/e2e/routes/admin/tenants.spec.ts
 * @description E2E tests for /admin/tenants — multi-tenant management.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Tenant Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page loads with tenant list", async ({ page }) => {
    await page.goto("/admin/tenants", { waitUntil: "domcontentloaded" });
    // Re-auth if content-init bounced us to login/collectionbuilder without session
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/admin/tenants");
    }
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    // The tenants table (with quota columns) always renders once the page loads —
    // empty installs show the "No tenants found." row inside it.
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15_000 });
    await expect(
      table.getByRole("columnheader", { name: /users|storage|collections|quota/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows quota information when tenants exist", async ({ page }) => {
    await page.goto("/admin/tenants", { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/admin/tenants");
    }
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15_000 });

    // Quota columns are always rendered in the table header — hard assertion.
    await expect(
      table.getByRole("columnheader", { name: /users|storage|collections|quota/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // The table body always renders at least one row — either a tenant row or
    // the "No tenants found." empty-state row — assert the deterministic union.
    await expect(table.locator("tbody tr").first()).toBeVisible({ timeout: 10_000 });
  });
});
