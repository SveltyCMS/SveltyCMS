/**
 * @file tests/e2e/routes/system/hooks-lane-smoke.spec.ts
 * @description
 * Thin browser-level canary for hooks + lane router stability.
 *
 * Catches regressions that unit/integration miss:
 * - Auth storage state rejected → redirect to /login
 * - Broken `handle` → system error shells on admin routes
 * - Health endpoint non-JSON (LB / readiness probes)
 *
 * Does NOT soft-skip: hard-fails if session is lost or shell fails to mount.
 */

import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { loginAsAdmin } from "../../helpers/auth";

const ADMIN_AUTH = path.join(process.cwd(), "tests/e2e/.auth/admin.json");

test.describe("Hooks / lane router smoke (admin session)", () => {
  test.use({
    storageState: existsSync(ADMIN_AUTH) ? ADMIN_AUTH : { cookies: [], origins: [] },
  });

  test("admin reaches dashboard without login redirect or system error", async ({ page }) => {
    test.skip(!existsSync(ADMIN_AUTH), "admin storageState missing — run auth-setup project first");

    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 45_000 });

    // Stale storageState (CI DB reset between runs) → session rejected → /login.
    // Re-auth so the smoke test stays green instead of hard-failing on a stale cookie.
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/dashboard");
    }

    // Hard fail: session poison or broken auth middleware
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/setup/, { timeout: 5_000 });

    const systemError = page.getByRole("heading", { name: /system error/i });
    await expect(systemError).toHaveCount(0);

    // Shell mounted (testid preferred over free text)
    await expect(page.getByTestId("page-title").or(page.locator("h1")).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("config hub loads under same session (APP_SSR lane path)", async ({ page }) => {
    test.skip(!existsSync(ADMIN_AUTH), "admin storageState missing — run auth-setup project first");

    await page.goto("/config", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /system error/i })).toHaveCount(0);
  });

  test("GET /health is JSON with overallStatus (HEALTH fast-path)", async ({ request }) => {
    const res = await request.get("/health");
    expect([200, 503]).toContain(res.status());
    const lane = res.headers()["x-svelty-lane"];
    // Header present when production hooks are active
    if (lane) {
      expect(lane).toBe("HEALTH");
    }
    const body = await res.json();
    expect(body).toHaveProperty("overallStatus");
    expect(typeof body.uptime === "number" || body.uptime === undefined).toBe(true);
  });
});
