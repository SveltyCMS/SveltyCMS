/**
 * @file tests/e2e/routes/config/design-system.spec.ts
 * @description E2E for /config/design-system (sole Appearance + Live Preview workspace).
 *
 * The GDPR cookie banner (role=dialog, z-9999) intercepts clicks on the save
 * button when it renders, so consent is pre-seeded before any navigation.
 * Navigation also verifies the post-login URL and re-authenticates on a
 * redirect to /login (stale storageState), matching appearance.spec.ts.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { seedCookieConsent } from "../../helpers/cookie-consent";

async function openWorkspace(page: Page, tab: string): Promise<void> {
  // Pre-seed consent so the GDPR banner never renders and intercepts clicks.
  await seedCookieConsent(page);
  await loginAsAdmin(page);
  await page.goto(`/config/design-system?tab=${tab}`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, `/config/design-system?tab=${tab}`);
  }
  await expect(page).toHaveURL(/\/config\/design-system/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("Design System workspace", () => {
  test("loads Design System with tabs", async ({ page }) => {
    await openWorkspace(page, "overrides");
    await expect(page.getByRole("heading", { level: 1, name: /design system/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("appearance-tabs")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("appearance-tab-overrides")).toBeVisible();
    await expect(page.getByTestId("appearance-tab-preview")).toBeVisible();
    await expect(page.getByTestId("appearance-tab-themes")).toBeVisible();
  });

  test("live preview tab shows playground", async ({ page }) => {
    await openWorkspace(page, "preview");
    await expect(page.getByTestId("design-system-preview")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/playground controls/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/semantic palettes/i)).toBeVisible({ timeout: 10_000 });
  });

  test("density control updates preview context", async ({ page }) => {
    await openWorkspace(page, "preview");
    await expect(page.getByTestId("design-system-preview")).toBeVisible({ timeout: 10_000 });

    const densitySelect = page.getByLabel(/^density$/i);
    await expect(densitySelect).toBeVisible({ timeout: 10_000 });
    await densitySelect.selectOption("compact");
    await expect(densitySelect).toHaveValue("compact");
    await expect(page.getByText(/structural tokens/i)).toBeVisible({ timeout: 10_000 });
  });

  test("overrides tab is deep-linkable", async ({ page }) => {
    await openWorkspace(page, "overrides");
    await expect(page.getByTestId("appearance-overrides-panel")).toBeVisible({ timeout: 10_000 });
  });

  test("palette studio is on Palette & Import tab", async ({ page }) => {
    await openWorkspace(page, "presets");
    await expect(page.getByTestId("palette-studio")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("palette-studio-apply")).toBeVisible();
  });

  test("my overrides density persists across reload", async ({ page }) => {
    await openWorkspace(page, "overrides");
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

      // Full reload — the preference must come back from server data, not
      // localStorage. Retry via toPass: the save is awaited before the toast,
      // but a fresh load re-serializes user prefs and may briefly lag.
      await expect(async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.goto("/config/design-system?tab=overrides", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("appearance-overrides-panel")).toBeVisible({
          timeout: 10_000,
        });
        await expect(page.getByLabel(/^density$/i)).toHaveValue(target.value, {
          timeout: 10_000,
        });
      }).toPass({ timeout: 25_000 });
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
