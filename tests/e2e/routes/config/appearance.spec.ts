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
    await expect(page.getByRole("heading", { name: /my overrides/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/^my layout$/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /save my preferences/i })).toBeVisible();
  });

  test("persists left sidebar layout preference after reload", async ({ page }) => {
    await page.goto("/config/appearance");
    const sidebarSelect = page.getByRole("combobox", { name: /left sidebar/i });
    await sidebarSelect.selectOption("hidden");
    const savePromise = page.waitForResponse(
      (r) => r.url().includes("update-user-attributes") && r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: /save my preferences/i }).click();
    const saveResponse = await savePromise;
    expect(saveResponse.ok()).toBeTruthy();
    await expect(page.getByText(/preferences applied/i)).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("combobox", { name: /left sidebar/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clear overrides resets layout to theme default", async ({ page }) => {
    await page.goto("/config/appearance");
    await page.getByRole("combobox", { name: /left sidebar/i }).selectOption("hidden");
    await page.getByRole("button", { name: /save my preferences/i }).click();
    await expect(page.getByText(/preferences applied/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /clear overrides/i }).click();
    await expect(page.getByText(/overrides cleared/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("combobox", { name: /left sidebar/i })).toHaveValue("", {
      timeout: 10_000,
    });
  });
});
