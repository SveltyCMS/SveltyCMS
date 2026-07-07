/**
 * @file tests/e2e/routes/admin-theme/visual-regression.spec.ts
 * @description Playwright visual regression baselines for admin theme pages.
 *
 * Baselines live beside this file under visual-regression.spec.ts-snapshots/.
 * Update with: bun x playwright test --project=visual-regression --update-snapshots
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { resetAndSeedDatabase } from "../../helpers/database";
import {
  dynamicMasks,
  openLoginSignInForm,
  prepareForScreenshot,
  STABLE_VIEWPORT,
  SCREENSHOT_OPTS,
} from "../../helpers/visual";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.use({
  viewport: STABLE_VIEWPORT,
  storageState: { cookies: [], origins: [] },
});

test.describe("Admin Theme Visual Regression", () => {
  test.skip(
    !!process.env.CI,
    "Baselines must be generated locally first: bun x playwright test --project=visual-regression --update-snapshots",
  );
  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase(page);
    await prepareForScreenshot(page);
  });

  test("login chooser — default branding", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const main = page.getByRole("main", { name: "Authentication Page" });
    await expect(main).toHaveScreenshot("login-chooser.png", {
      ...SCREENSHOT_OPTS,
      mask: dynamicMasks(page),
    });
  });

  test("login sign-in form", async ({ page }) => {
    await openLoginSignInForm(page);
    const form = page.locator("section.active");
    await expect(form).toHaveScreenshot("login-signin-form.png", SCREENSHOT_OPTS);
  });

  test("dashboard — AdminPageShell", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const shell = page.locator(".admin-theme-container").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });
    await expect(shell).toHaveScreenshot("dashboard.png", {
      ...SCREENSHOT_OPTS,
      mask: [page.locator('[data-testid="floating-chat"]')],
    });
  });

  test("config hub — AdminPageShell", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/config", { waitUntil: "domcontentloaded" });
    const shell = page.locator(".admin-theme-container").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });
    await expect(shell).toHaveScreenshot("config-hub.png", SCREENSHOT_OPTS);
  });

  test("appearance settings — AdminPageShell", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/config/appearance", { waitUntil: "domcontentloaded" });
    const shell = page.locator(".admin-theme-container").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("My Overrides", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(shell).toHaveScreenshot("appearance.png", SCREENSHOT_OPTS);
  });

  test("system settings — cache group", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/config/system-settings?group=cache", {
      waitUntil: "domcontentloaded",
    });
    const shell = page.locator(".admin-theme-container").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });
    await expect(shell).toHaveScreenshot("system-settings-cache.png", SCREENSHOT_OPTS);
  });

  test("media gallery — AdminPageShell", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
    const shell = page.locator(".admin-theme-container").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });
    await expect(shell).toHaveScreenshot("media-gallery.png", SCREENSHOT_OPTS);
  });

  test("design system playground — AdminPageShell", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/config/design-system", { waitUntil: "domcontentloaded" });
    const shell = page.locator(".admin-theme-container").first();
    await expect(shell).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Playground controls", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(shell).toHaveScreenshot("design-system.png", SCREENSHOT_OPTS);
  });
});
