/**
 * @file tests/e2e/routes/login/branding.spec.ts
 * @description E2E tests for tenant-branded login and public branding API.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin, logout } from "../../helpers/auth";
import { resetAndSeedDatabase } from "../../helpers/database";
import { enableBrandedLogin, resetAdminTheme } from "../../helpers/theme";
import { openLoginSignInForm } from "../../helpers/visual";

test.describe.configure({ mode: "serial" });

test.describe("Login Branding", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase(page);
  });

  test("public branding API returns nulls for default hostname", async ({ page }) => {
    const res = await page.request.get("/api/theme/public?hostname=127.0.0.1");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toEqual({
      siteName: null,
      logoUrl: null,
      accentColor: null,
    });
  });

  test("login chooser renders default SveltyCMS shell", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main", { name: "Authentication Page" })).toBeVisible();
    await expect(page.getByTestId("signin-icon")).toBeVisible();
    await expect(page.getByRole("button", { name: "Go to Sign Up" })).toBeVisible();
  });

  test("branded login applies elevated card shell after admin enables feature", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await enableBrandedLogin(page, "elevated");

    const themeRes = await page.request.get("/api/theme/admin-theme");
    expect(themeRes.ok()).toBeTruthy();
    const theme = await themeRes.json();
    expect(theme.features?.brandedLogin).toBe(true);

    await logout(page);
    await openLoginSignInForm(page);

    const formShell = page.locator("section.active .relative.z-10").first();
    await expect(formShell).toBeVisible();
    await expect(formShell).toHaveClass(/shadow-xl/);
    await expect(formShell).toHaveClass(/border/);

    // Restore defaults for downstream specs
    await loginAsAdmin(page);
    await resetAdminTheme(page);
    await logout(page);
  });
});
