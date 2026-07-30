/**
 * @file tests/e2e/routes/config/design-system.spec.ts
 * @description E2E for /config/design-system (sole Appearance + Live Preview workspace).
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Design System workspace", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("loads Design System with tabs", async ({ page }) => {
    await page.goto("/config/design-system");
    await expect(page.getByRole("heading", { level: 1, name: /design system/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("appearance-tabs")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("appearance-tab-overrides")).toBeVisible();
    await expect(page.getByTestId("appearance-tab-preview")).toBeVisible();
    await expect(page.getByTestId("appearance-tab-themes")).toBeVisible();
  });

  test("live preview tab shows playground", async ({ page }) => {
    await page.goto("/config/design-system?tab=preview");
    await expect(page.getByTestId("design-system-preview")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/playground controls/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/semantic palettes/i)).toBeVisible({ timeout: 10_000 });
  });

  test("density control updates preview context", async ({ page }) => {
    await page.goto("/config/design-system?tab=preview");
    await expect(page.getByTestId("design-system-preview")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel(/^density$/i).selectOption("compact");
    await expect(page.getByText(/structural tokens/i)).toBeVisible({ timeout: 10_000 });
  });

  test("overrides tab is deep-linkable", async ({ page }) => {
    await page.goto("/config/design-system?tab=overrides");
    await expect(page.getByTestId("appearance-overrides-panel")).toBeVisible({ timeout: 10_000 });
  });

  test("palette studio is on Palette & Import tab", async ({ page }) => {
    await page.goto("/config/design-system?tab=presets");
    await expect(page.getByTestId("palette-studio")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("palette-studio-apply")).toBeVisible();
  });
});
