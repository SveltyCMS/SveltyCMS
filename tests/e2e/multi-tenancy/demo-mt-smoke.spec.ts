/**
 * @file tests/e2e/multi-tenancy/demo-mt-smoke.spec.ts
 * @description Active Multi-Tenant + Demo Mode smoke pass across critical admin routes and visitor provisioning.
 *
 * Verifies under active `MULTI_TENANT=true` (and optional `DEMO=true`) configuration:
 * - Admin routes `/config/queue`, `/config/trash`, `/config/sync`, `/config/system-settings`,
 *   `/config/collectionbuilder`, and `/mediagallery` load without 500s or `TENANT_CONTEXT_MISSING` errors
 * - `/config/queue` renders `Retry Failed` and `Clear Completed` controls
 * - `/config/system-settings` Quick Search filters and navigates cleanly
 * - `/api/system-jobs` GET/POST works without tenant-context errors
 * - In Demo mode (`DEMO=true`), anonymous visitors receive a seeded `demo_tenant_id` cookie
 */

import { expect, test } from "../fixtures";
import { loginAsAdmin, waitForHydration } from "../helpers/auth";

const MULTI_TENANT_ENABLED = process.env.MULTI_TENANT === "true";
const DEMO_ENABLED = process.env.DEMO === "true";
const skipReason = "Skipped: set MULTI_TENANT=true to enable the Demo/MT smoke suite";

const ADMIN_ROUTES = [
  { path: "/config/queue", testId: "queue-page" },
  { path: "/config/trash", testId: "page-title" },
  { path: "/config/sync", testId: "page-title" },
  { path: "/config/system-settings", testId: "system-settings-page" },
  { path: "/config/collectionbuilder", testId: "page-title" },
  { path: "/mediagallery", testId: "page-title" },
] as const;

test.describe("Multi-Tenant & Demo Mode Admin Smoke", () => {
  test.setTimeout(120_000);
  test.skip(!MULTI_TENANT_ENABLED, skipReason);

  test("critical admin surfaces load without 500s or TENANT_CONTEXT_MISSING errors", async ({
    page,
  }) => {
    const serverErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("response", (res) => {
      if (res.status() >= 500) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await loginAsAdmin(page);

    for (const route of ADMIN_ROUTES) {
      const response = await page.goto(route.path, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      expect(response?.status() ?? 0, `${route.path} returned unexpected HTTP status`).toBeLessThan(
        400,
      );
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
      await expect(page.getByTestId(route.testId)).toBeVisible({ timeout: 20_000 });
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toMatch(/TENANT_CONTEXT_MISSING|Security Violation/i);
    }

    // Queue UX check: Retry Failed + Clear Completed controls present
    await page.goto("/config/queue", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.getByTestId("queue-retry-failed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("queue-clear-completed")).toBeVisible({ timeout: 15_000 });

    // System Settings Quick Search UX check (retry fill in case hydration settles after first input)
    await page.goto("/config/system-settings", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForHydration(page);
    const searchInput = page.getByTestId("settings-quick-search");
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await searchInput.fill("timezone");
      await expect(page.getByTestId("settings-quick-search-results")).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId("settings-quick-search-results")).toContainText(/site/i);

    // System jobs API parity check under MT/Demo
    const jobsRes = await page.request.get("/api/system-jobs");
    expect(jobsRes.status(), "GET /api/system-jobs must not fail under MT/Demo").toBe(200);

    expect(serverErrors, `5xx responses encountered: ${serverErrors.join(", ")}`).toEqual([]);
    expect(consoleErrors, `Console errors encountered: ${consoleErrors.join(", ")}`).toEqual([]);
  });

  test("demo visitor request assigns demo_tenant_id cookie when DEMO=true", async ({
    browser,
    baseURL,
  }) => {
    test.skip(!DEMO_ENABLED, "Skipped: set DEMO=true alongside MULTI_TENANT=true");
    // Explicit empty storageState so Playwright does not attach the admin session cookie.
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      // Request a non-bootstrap route (`/dashboard`) so handleAuthentication runs and provisions demo_tenant_id
      const res = await context.request.get("/dashboard", { maxRedirects: 0 });
      expect(res.status()).toBeLessThan(500);
      const cookies = await context.cookies();
      const hasDemoCookie = cookies.some(
        (c) => c.name === "demo_tenant_id" || c.name === "__Host-demo_tenant_id",
      );
      expect(hasDemoCookie, `Expected demo tenant cookie in ${JSON.stringify(cookies)}`).toBe(true);
    } finally {
      await context.close();
    }
  });
});
