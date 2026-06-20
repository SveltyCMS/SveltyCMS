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
    await expect(page.getByRole("heading", { level: 1, name: /tenant/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("table")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows quota information when tenants exist", async ({ page }) => {
    await page.goto("/admin/tenants");
    const quotaHeaders = page.getByText(/users|storage|collections|quota/i);
    const emptyState = page.getByText(/no tenants/i);
    await expect(quotaHeaders.or(emptyState).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
