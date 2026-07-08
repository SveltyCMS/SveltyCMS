/**
 * @file tests/e2e/routes/config/appearance.spec.ts
 * @description E2E tests for /config/appearance — per-user overrides and layout prefs (Phase 5).
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Appearance — My Overrides", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("page loads My Overrides and My Layout sections", async ({ page }) => {
    await page.goto("/config/appearance");
    await expect(
      page.getByRole("heading", { level: 1, name: /admin theme settings/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 3, name: /my overrides/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/^my layout$/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /save my preferences/i })).toBeVisible();
  });

  test("persists left sidebar layout preference after reload", async ({ page }) => {
    // Capture browser console for debugging
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[DEBUG]')) logs.push(text);
    });

    await page.goto("/config/appearance");
    await page.getByLabel("Left sidebar", { exact: true }).selectOption("hidden");
    await page.getByRole("button", { name: /save my preferences/i }).click();
    await expect(page.getByText(/preferences applied/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });

    // Check value and dump debug logs on failure
    try {
      await expect(page.getByLabel("Left sidebar", { exact: true })).toHaveValue("hidden", {
        timeout: 10_000,
      });
    } catch (e) {
      console.log("=== DEBUG LOGS ===");
      logs.forEach(l => console.log(l));
      console.log("=== END DEBUG LOGS ===");
      throw e;
    }
  });

  test("clear overrides resets layout to theme default", async ({ page }) => {
    await page.goto("/config/appearance");
    await page.getByLabel("Left sidebar", { exact: true }).selectOption("hidden");
    await page.getByRole("button", { name: /save my preferences/i }).click();
    await expect(page.getByText(/preferences applied/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /clear overrides/i }).click();
    await expect(page.getByText(/overrides cleared/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel("Left sidebar", { exact: true })).toHaveValue("", {
      timeout: 10_000,
    });
  });
});
