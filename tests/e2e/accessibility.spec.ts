/**
 * @file tests/e2e/accessibility.spec.ts
 * @description E2E accessibility smoke test — keyboard focus indicator visibility on the login page.
 *
 * @see docs/tests/accessibility-audit.mdx
 * @see tests/e2e/routes/login/accessibility.spec.ts (comprehensive axe-core audits)
 */
import { test, expect } from "@playwright/test";
import { seedCookieConsent } from "./helpers/cookie-consent";
import { prepareLoginForm } from "./helpers/auth";

test.use({ storageState: { cookies: [], origins: [] } });

test("focus indicator is visible on keyboard navigation", async ({ page }) => {
  // prepareLoginForm handles first-user mode (auto-seed) so the test doesn't
  // fail when the DB has no users and only the SIGN UP form is visible.
  await seedCookieConsent(page);
  await prepareLoginForm(page);

  // Focus the email field and tab to the password field
  await page.getByTestId("signin-email").focus();
  await page.keyboard.press("Tab");

  // Verify the focused element has a visible focus ring (not outline:none)
  const focusedEl = page.locator(":focus");
  await expect(focusedEl).toBeVisible();

  const { outlineStyle, boxShadow, ringShadow } = await focusedEl.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
      ringShadow:
        style.getPropertyValue("--tw-ring-shadow") ||
        style.getPropertyValue("--tw-ring-offset-shadow"),
    };
  });

  const hasFocusRing =
    outlineStyle !== "none" || (boxShadow !== "none" && boxShadow !== "") || Boolean(ringShadow);
  expect(hasFocusRing).toBe(true);
});
