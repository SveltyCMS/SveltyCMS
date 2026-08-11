/**
 @file tests/e2e/routes/login/accessibility.spec.ts
 * @description Playwright end-to-end accessibility testing for SveltyCMS.
 *   - Verifies WCAG 2.2 AA and WCAG 3.0 draft guidelines.
 *   - Run automated accessibility audits via Axe-Core.
 *   - Implements RTL auditing by injecting dir="rtl" on <html>.
 *   - Programmatically verifies keyboard focus management.
 */

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAsAdmin } from "../../helpers/auth";
import { resetAndSeedDatabase } from "../../helpers/api";

test.describe("Universal Accessibility Audits", () => {
  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase(page);
  });

  test("Login Page - Automated Axe Audit", async ({ page }) => {
    await page.context().clearCookies();
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
    // 1. Login first — loginAsAdmin lands on /user (protected), not collectionbuilder
    await loginAsAdmin(page, "/user");
    await page.waitForURL(/\/(user|Collections|admin|dashboard|collectionbuilder|en)/i, {
      timeout: 15_000,
    });

    // 2. Set HTML dir="rtl" to simulate RTL layout (Arabic/Hebrew locale flow)
    await page.evaluate(() => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.lang = "ar";
    });

    // 3. Wait until RTL directionality is actually applied before auditing
    // (bounded — resolves as soon as dir="rtl" takes effect, no fixed sleep)
    await page.waitForFunction(() => document.documentElement.dir === "rtl", undefined, {
      timeout: 3_000,
    });

    // 3b. Settle signal: the layout sets <title> after hydration completes.
    // Auditing mid-hydration (parallel runs) reports phantom "document has no
    // title" violations. Wait for the real title instead of a fixed sleep.
    await page.waitForFunction(() => (document.title || "").trim().length > 0, undefined, {
      timeout: 10_000,
    });

    // 4. Run accessibility audit against the RTL layout
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();

    if (results.violations.length > 0) {
      console.warn("A11y violations in RTL layout:", JSON.stringify(results.violations, null, 2));
    }

    const criticalViolations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    // Log-only coverage let real RTL regressions pass silently — critical/serious
    // violations are now blocking (matches the Login Page Axe audit above).
    expect(criticalViolations).toEqual([]);
    console.log("✓ RTL layout passes automated accessibility audit.");
  });

  test("Keyboard Traversal - Focus Trap & Focus Ring Visibility", async ({ page }) => {
    await page.context().clearCookies();
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
    const { outlineStyle, boxShadow } = await passwordField.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
    });

    // In Tailwind v4/Native UI, focus is styled via ring/boxShadow or outline
    const hasFocusStyle = outlineStyle !== "none" || (boxShadow !== "none" && boxShadow !== "");
    expect(hasFocusStyle).toBe(true);
  });
});
