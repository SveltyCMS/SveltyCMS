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

  test("my overrides density persists across reload", async ({ page }) => {
    await page.goto("/config/design-system?tab=overrides");
    await expect(page.getByTestId("appearance-overrides-panel")).toBeVisible({ timeout: 10_000 });

    const densityOptions = [
      { value: "", label: "Use theme default" },
      { value: "compact", label: "Compact" },
      { value: "cozy", label: "Cozy" },
      { value: "spacious", label: "Spacious" },
    ];
    const densitySelect = page.getByLabel(/^density$/i);
    await expect(densitySelect).toBeVisible({ timeout: 10_000 });

    const originalValue = await densitySelect.inputValue();
    const originalLabel =
      densityOptions.find((o) => o.value === originalValue)?.label ?? "Use theme default";
    // Pick a density that actually differs from the current preference.
    const target = densityOptions.find((o) => o.label !== originalLabel) ?? densityOptions[1];

    try {
      await densitySelect.selectOption({ label: target.label });
      await page.getByTestId("appearance-save-overrides").click();
      await expect(page.getByText(/preferences applied/i)).toBeVisible({ timeout: 10_000 });

      // Full reload — the preference must come back from server data, not localStorage.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("appearance-overrides-panel")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel(/^density$/i)).toHaveValue(target.value, {
        timeout: 10_000,
      });
    } finally {
      // Restore the previous preference so the seeded admin stays deterministic.
      try {
        const select = page.getByLabel(/^density$/i);
        if (await select.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await select.selectOption({ label: originalLabel });
          await page.getByTestId("appearance-save-overrides").click();
          await expect(page.getByText(/preferences applied/i)).toBeVisible({ timeout: 10_000 });
        }
      } catch (err) {
        console.warn("[design-system] density override revert failed:", err);
      }
    }
  });
});
