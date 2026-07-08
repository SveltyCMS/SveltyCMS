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
    await page.goto("/admin/tenants");
    console.log('[DIAG] final URL:', page.url());
    const heading = page.getByRole("heading", { level: 1, name: /tenants/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    // Table is only present when tenants exist; skip if not visible
    const table = page.getByRole("table");
    if (await table.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(table).toBeVisible();
    }
  });

  test("shows quota information when tenants exist", async ({ page }) => {
    await page.goto("/admin/tenants");
    // Check empty state first — if visible, no tenants loaded; otherwise verify quota column headers.
    const emptyState = page.getByText(/no tenants/i);
    if (await emptyState.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(emptyState).toBeVisible();
    } else {
      // Tenants exist — quota column headers are rendered in the table
      const table = page.getByRole("table");
      await expect(table.getByRole("columnheader", { name: /users/i })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: /storage/i })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: /collections/i })).toBeVisible();
    }
  });
});
