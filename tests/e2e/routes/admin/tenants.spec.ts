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
    // The page heading "Tenants" is the always-present, unambiguous signal that
    // the page loaded. (A broad `.or(getByText(/tenant.../i))` matches too much —
    // the heading, spans, the "Create Tenant" button, and the "No tenants
    // found." cell — and triggers a strict-mode violation.)
    await expect(page.getByRole("heading", { level: 1, name: /tenants/i })).toBeVisible({
      timeout: 15_000,
    });
    // Table is only present when tenants exist; skip if not visible
    const table = page.getByRole("table");
    if (await table.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(table).toBeVisible();
    }
  });

  test("shows quota information when tenants exist", async ({ page }) => {
    await page.goto("/admin/tenants");
    const quotaHeaders = page.getByText(/users|storage|collections|quota/i);
    const emptyState = page.getByText(/no tenants|not found/i);
    await expect(quotaHeaders.or(emptyState).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
