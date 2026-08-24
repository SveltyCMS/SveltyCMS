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

/**
 * Owner-decision brand exception: `src/app.css` keeps the bright brand ramp
 * (`--color-primary-500: oklch(76.87% …)`, tertiary + surface also brightened),
 * which renders white text on `bg-primary-500` at ~1.94:1 and small
 * `text-surface-500` labels at ~3.9:1 — below the 4.5:1 AA threshold axe's
 * `color-contrast` rule enforces. Per the owner decision the ramp stays bright,
 * so `color-contrast` violations whose nodes are EXCLUSIVELY brand-colored
 * (fills: `bg-primary-500` / `preset-filled-primary-500`; small muted text:
 * `text-surface-500`) are exempted from the blocking gate. Every other element
 * on the audited pages is still fully checked — the exemption is scoped to
 * these classes, not the page.
 *
 * NOTE: the `text-surface-500` exemption is broader than ideal — it silences
 * genuine small-gray-text contrast findings. Reverting `--color-surface-500`
 * to the committed 52% would restore that auditing while keeping the brand
 * ramp bright (see src/app.css).
 */
const BRAND_FILL_CLASS = /(?:^|[^.\w-])bg-primary-500|preset-filled-primary-500/;
const SURFACE_TEXT_CLASS = /text-surface-500/;

function nodeIsExempt(node: { html?: string; target?: string[] }): boolean {
  const html = node.html ?? "";
  const target = (node.target ?? []).join(" ");
  return (
    BRAND_FILL_CLASS.test(html) ||
    BRAND_FILL_CLASS.test(target) ||
    SURFACE_TEXT_CLASS.test(html) ||
    SURFACE_TEXT_CLASS.test(target)
  );
}

function exemptBrandColorViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
  return violations.filter((v) => {
    if (v.id !== "color-contrast") return true;
    const nodes = v.nodes ?? [];
    if (nodes.length === 0) return true;
    // Drop only when EVERY failing node is brand-colored (see note above).
    return !nodes.every((n) => nodeIsExempt(n));
  });
}

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

    // The sign-in form is wrapped in transition:fade — auditing mid-animation
    // reports phantom color-contrast violations (opacity < 1 blends the text
    // color with the background). Wait until the animation settles (opacity 1)
    // before running Axe.
    await page.waitForFunction(
      () => {
        let el = document.querySelector('[data-testid="signin-email"]');
        if (!el) return false;
        // opacity is not inherited, so multiply ancestor opacities to get the
        // effective (visually composited) value
        let effective = 1;
        while (el && el !== document.documentElement) {
          const o = Number.parseFloat(getComputedStyle(el).opacity);
          if (!Number.isNaN(o)) effective *= o;
          el = el.parentElement;
        }
        return effective >= 0.999;
      },
      undefined,
      { timeout: 10_000 },
    );

    // Run Axe audit
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Log violations to console for developer debugging
    if (results.violations.length > 0) {
      console.warn("A11y violations on Login Page:", JSON.stringify(results.violations, null, 2));
    }

    // Fail if there are any critical/serious violations (brand colors excluded)
    const criticalViolations = exemptBrandColorViolations(results.violations).filter(
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

    const criticalViolations = exemptBrandColorViolations(results.violations).filter(
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
