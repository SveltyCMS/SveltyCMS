/**
 * @file tests/e2e/accessibility.spec.ts
 * @description E2E accessibility smoke test — keyboard focus indicator visibility on the login page.
 *
 * @see docs/tests/accessibility-audit.mdx
 * @see tests/e2e/routes/login/accessibility.spec.ts (comprehensive axe-core audits)
 */
import { test, expect } from "@playwright/test";

test("focus indicator is visible on keyboard navigation", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Click Sign In to reveal the form
  const signInIcon = page.getByTestId("signin-icon");
  if (await signInIcon.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await signInIcon.click({ force: true });
  }
  await page.getByTestId("signin-email").waitFor({ state: "visible", timeout: 10_000 });

  // Focus the email field and tab to the password field
  await page.getByTestId("signin-email").focus();
  await page.keyboard.press("Tab");

  // Verify the focused element has a visible focus ring (not outline:none)
  const focusedEl = page.locator(":focus");
  await expect(focusedEl).toBeVisible();

  const { outlineStyle, boxShadow } = await focusedEl.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
  });

  const hasFocusRing = outlineStyle !== "none" || (boxShadow !== "none" && boxShadow !== "");
  expect(hasFocusRing).toBe(true);
});
