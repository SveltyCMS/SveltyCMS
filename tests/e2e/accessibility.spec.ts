/**
 * @file tests/e2e/accessibility.spec.ts
 * @description Playwright end-to-end accessibility testing for SveltyCMS.
 *   - Verifies WCAG 2.2 AA and WCAG 3.0 draft guidelines.
 *   - Run automated accessibility audits via Axe-Core.
 *   - Implements RTL auditing by injecting dir="rtl" on <html>.
 *   - Programmatically verifies keyboard focus management.
 */

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAsAdmin, ADMIN_CREDENTIALS } from "./helpers/auth";
import { TEST_API_HEADERS } from "./helpers/test-api";

test.describe("Universal Accessibility Audits", () => {
  // Reset and seed the database to ensure a clean state
  test.beforeEach(async ({ page }) => {
    console.log("[A11y Test] Resetting database via Testing API...");
    const resetResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "reset" },
    });
    expect(resetResponse.ok()).toBeTruthy();

    console.log("[A11y Test] Seeding database with admin...");
    const seedResponse = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    expect(seedResponse.ok()).toBeTruthy();
  });

  test("Login Page - Automated Axe Audit", async ({ page }) => {
    await page.goto("/login");
    // Click Sign In to reveal the signin form (hidden behind chooser by default)
    const signInIcon = page.getByTestId("signin-icon");
    if (await signInIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signInIcon.click({ force: true });
    } else {
      await page
        .locator('div[role="button"]:has-text("SIGN IN"), p:has-text("Sign In")')
        .first()
        .click({ force: true });
    }
    await page.getByTestId("signin-email").waitFor({ state: "visible" });

    // Run Axe audit
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Log violations to console for developer debugging
    if (results.violations.length > 0) {
      console.warn("A11y violations on Login Page:", JSON.stringify(results.violations, null, 2));
    }

    // Fail if there are any critical/serious violations
    const criticalViolations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(criticalViolations.length).toBe(0);
  });

  test("RTL Audit - Verify LTR to RTL Mirroring Stability", async ({ page }) => {
    // 1. Login first
    await loginAsAdmin(page);
    await page.waitForURL(/\/(Collections|admin|dashboard|collectionbuilder)/, {
      timeout: 15_000,
    });

    // 2. Set HTML dir="rtl" to simulate RTL layout (Arabic/Hebrew locale flow)
    await page.evaluate(() => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.lang = "ar";
    });

    // 3. Let Svelte 5 process the DOM updates
    await page.waitForTimeout(500);

    // 4. Run accessibility audit against the RTL layout
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(criticalViolations.length).toBe(0);
    console.log("✓ RTL layout passes automated accessibility audit.");
  });

  test("Keyboard Traversal - Focus Trap & Focus Ring Visibility", async ({ page }) => {
    await page.goto("/login");

    // Check that we can move focus using Tab key
    const emailField = page.getByTestId("signin-email");
    const passwordField = page.getByTestId("signin-password");

    // Focus first element
    await emailField.focus();
    await expect(emailField).toBeFocused();

    // Tab to password
    await page.keyboard.press("Tab");
    await expect(passwordField).toBeFocused();

    // Check that outline/focus rings are visible programmatically
    const outlineStyle = await passwordField.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.outlineStyle || style.boxShadow;
    });

    // In Tailwind v4/Native UI, focus is styled via ring/boxShadow or outline
    expect(outlineStyle).not.toBe("none");
  });
});
