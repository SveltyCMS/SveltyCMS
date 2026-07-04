/**
 * @file tests/e2e/accessibility.spec.ts
 * @description E2E tests for accessibility (keyboard navigation, focus indicators, ARIA compliance).
 *
 * ### Features:
 * - Keyboard focus indicator visibility
 * - Tab navigation through interactive elements
 *
 * @see docs/tests/accessibility-audit.mdx
 */
import { test, expect } from "@playwright/test";

test("focus indicator is visible on keyboard navigation", async ({ page }) => {
  // Navigate to admin dashboard
  await page.goto("/admin");

  // Press Tab to move focus through interactive elements
  await page.keyboard.press("Tab");

  // Verify the focused element has a visible focus ring
  const focusedEl = page.locator(":focus");
  await expect(focusedEl).toBeVisible();

  // Verify focus ring is visible (not outline:none)
  const outline = await focusedEl.evaluate((el) => window.getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});
