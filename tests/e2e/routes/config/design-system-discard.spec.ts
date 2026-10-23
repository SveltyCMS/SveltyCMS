/**
 * @file tests/e2e/routes/config/design-system-discard.spec.ts
 * @description Pins the Design System discard contract (F05).
 *
 * An unchanged form must NOT be dirty (no "Unsaved changes" bar), and Discard must
 * restore both the form controls and the shared live theme — not merely hide the
 * warning while the unsaved appearance stays applied to the admin shell.
 *
 * The shared live theme is observable through the app shell's `data-density`
 * attribute (written from `AdminTheme`) and through the variant-aware border width
 * of an `AdminCard` (`flat` → 0px, `bordered`/`elevated` → 1px).
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
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
  // The clean-form assertion below must observe the hydrated state: before hydration
  // the SSR tree cannot show the dirty bar either way.
  await waitForHydration(page);
}

/**
 * Select an option and verify the *state* accepted it — `selectOption` can land
 * before Svelte hydration attached the binding (see design-system.spec.ts:27-42).
 */
async function selectOptionVerified(select: Locator, value: string): Promise<void> {
  await expect(async () => {
    await select.selectOption({ value });
    await expect(select).toHaveValue(value, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

/** `AdminCard`'s variant-aware border width: flat renders no border. */

/** The theme save bar's dirty warning — distinct from the entry sidebar's "Unsaved changes". */
function dirtyWarning(page: Page): Locator {
  return page.locator("p").filter({ hasText: /unsaved changes — live preview active/i });
}

test.describe("Design System discard", () => {
  test("opening an unchanged theme is clean and Discard restores density + live theme", async ({
    page,
  }) => {
    await openWorkspace(page, "layout");

    const densitySelect = page.getByLabel("Admin Density", { exact: true });
    await expect(densitySelect).toBeVisible({ timeout: 15_000 });

    const discard = page.getByTestId("appearance-theme-discard");
    await expect(discard).toHaveCount(0);
    await expect(dirtyWarning(page)).toHaveCount(0);

    const savedDensity = await densitySelect.inputValue();
    expect(["compact", "cozy", "spacious"]).toContain(savedDensity);
    const targetDensity = savedDensity === "compact" ? "spacious" : "compact";

    await selectOptionVerified(densitySelect, targetDensity);
    await expect(discard).toBeVisible();
    await expect(dirtyWarning(page)).toBeVisible();

    // Live preview really changed the shared theme, not just the select.
    const shell = page.locator("div[data-admin-theme]").first();
    await expect(shell).toHaveAttribute("data-density", targetDensity);

    await discard.click();

    await expect(discard).toHaveCount(0);
    await expect(dirtyWarning(page)).toHaveCount(0);
    await expect(densitySelect).toHaveValue(savedDensity);
    // The shared appearance returns to the saved theme too.
    await expect(shell).toHaveAttribute("data-density", savedDensity);
  });

  test("Discard restores the card style control and its live chrome", async ({ page }) => {
    await openWorkspace(page, "style");

    const variantSelect = page.getByLabel("Card Variant", { exact: true });
    await expect(variantSelect).toBeVisible({ timeout: 15_000 });

    const discard = page.getByTestId("appearance-theme-discard");
    await expect(discard).toHaveCount(0);

    const tabsCard = page.locator("div.card").filter({ has: page.getByTestId("appearance-tabs") });
    await expect(tabsCard).toHaveCount(1);

    const savedVariant = await variantSelect.inputValue();
    expect(["flat", "bordered", "elevated"]).toContain(savedVariant);
    const targetVariant = savedVariant === "flat" ? "bordered" : "flat";

    // Compare against the value the app actually renders, not a guessed px mapping:
    // the card's hairline resolves to a fractional width, so a hardcoded 0/1px table
    // fails while the product is correct.
    const savedBorder = await tabsCard.evaluate((el) => getComputedStyle(el).borderTopWidth);

    await selectOptionVerified(variantSelect, targetVariant);
    await expect(discard).toBeVisible();
    await expect(tabsCard).not.toHaveCSS("border-top-width", savedBorder);

    await discard.click();

    await expect(discard).toHaveCount(0);
    await expect(variantSelect).toHaveValue(savedVariant);
    await expect(tabsCard).toHaveCSS("border-top-width", savedBorder);
  });
});
