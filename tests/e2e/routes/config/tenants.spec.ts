/**
 * @file tests/e2e/routes/config/tenants.spec.ts
 * @description E2E tests for /config/tenants — multi-tenant management.
 *
 * `MULTI_TENANT` is a FILE setting (private.ts), not a database one, so the same
 * suite runs against two very different deployments. The route contract differs:
 * with multi-tenancy off the page is not reachable at all (303 → /config); with it
 * on the quota table must render. Both branches are asserted, and the branch that
 * does not apply to this deployment is reported as a skip — never silently green.
 */

import { test, expect } from "../../fixtures";
import { loginAsAdmin } from "../../helpers/auth";

const ROUTE = "/config/tenants";

/** True when this deployment serves the tenants page instead of redirecting away. */
async function multiTenantEnabled(page: Parameters<typeof loginAsAdmin>[0]): Promise<boolean> {
  const probe = await page.request.get(ROUTE, { maxRedirects: 0 });
  return probe.status() < 300 || probe.status() >= 400;
}

test.describe("Tenant Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("multi-tenant off: the tenants route redirects to /config", async ({ page }) => {
    const probe = await page.request.get(ROUTE, { maxRedirects: 0 });
    if (probe.status() < 300) {
      test.skip(true, "MULTI_TENANT is enabled in this deployment — covered by the enabled case");
    }
    expect(probe.status(), `GET ${ROUTE} must not render when MULTI_TENANT is off`).toBe(303);
    const location = probe.headers()["location"] ?? "";
    expect(location).toContain("/config");
    expect(location).not.toContain("/login");

    // The redirect must survive a real navigation, not just the API probe.
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/config(\/|$|\?)/, { timeout: 15_000 });
  });

  test("multi-tenant on: page loads with tenant list", async ({ page }) => {
    if (!(await multiTenantEnabled(page))) {
      test.skip(
        true,
        "MULTI_TENANT is off in this deployment (private.ts) — 303 contract asserted above",
      );
    }
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, ROUTE);
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

  test("multi-tenant on: shows quota information when tenants exist", async ({ page }) => {
    if (!(await multiTenantEnabled(page))) {
      test.skip(
        true,
        "MULTI_TENANT is off in this deployment (private.ts) — 303 contract asserted above",
      );
    }
    await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, ROUTE);
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
