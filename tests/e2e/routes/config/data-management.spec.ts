/**
 * @file tests/e2e/routes/config/data-management.spec.ts
 * @description E2E smoke tests for data management config pages — importer, sync, trash, redirects.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Data Management Pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("migration page loads", async ({ page }) => {
    await page.goto("/config/migration");
    await expect(page.getByRole("heading", { level: 1, name: /migration|import/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/upload|select file|drag|choose|source/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("sync page loads", async ({ page }) => {
    await page.goto("/config/sync");
    await expect(page.getByRole("heading", { level: 1, name: /sync/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/status|sync|changes|backup/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("trash page loads", async ({ page }) => {
    await page.goto("/config/trash");
    await expect(page.getByRole("heading", { level: 1, name: /trash/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/trash|deleted|restore/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("redirects page loads with pagination", async ({ page }) => {
    await page.goto("/config/redirects");
    await expect(page.getByRole("heading", { level: 1, name: /redirect/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /add|create|new/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
