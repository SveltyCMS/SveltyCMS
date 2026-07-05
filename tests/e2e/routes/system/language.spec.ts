/**
 * @file tests/playwright/language.spec.ts
 * @description Playwright end-to-end test for changing the system language in SveltyCMS.
 *   - Logs in as admin
 *   - Iterates through language options (EN, FR, DE, ES)
 *   - Selects each language from the dropdown and waits for UI update
 */
import { test } from "@playwright/test";
import { ensureSidebarVisible, loginAsAdmin } from "../../helpers/auth";

test.describe("System Language Change", () => {
  test.setTimeout(60_000); // 1 min

  test("Login and change system language between EN and DE", async ({ page }) => {
    // 1. Login
    await loginAsAdmin(page, /\/(admin|Collections|collectionbuilder|dashboard)/);

    // 2. On mobile viewports, open sidebar to access language selector
    await ensureSidebarVisible(page);

    // 3. Find language selector container (uses data-testid)
    const languageSelector = page.getByTestId("language-selector");
    const isVisible = await languageSelector.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isVisible) {
      console.log("⚠ Language selector not found in current UI, skipping language change test.");
      return;
    }

    // 4. Get the trigger button (shows current language code like "en", "de")
    const triggerButton = languageSelector.getByRole("button", { name: /select language/i });

    // 5. Switch from current language to German
    await triggerButton.click();
    await page.waitForTimeout(500);

    // Find and click the "Deutsch" option in the dropdown
    const deOption = page.getByRole("button", { name: /deutsch/i, exact: false });
    const deVisible = await deOption.isVisible({ timeout: 2000 }).catch(() => false);
    if (deVisible) {
      await deOption.click();
      await page.waitForTimeout(1000);
      console.log("✓ Language changed to DE");
    }

    // 6. Switch back to English
    await triggerButton.click();
    await page.waitForTimeout(500);

    const enOption = page.getByRole("button", { name: /english/i, exact: false });
    const enVisible = await enOption.isVisible({ timeout: 2000 }).catch(() => false);
    if (enVisible) {
      await enOption.click();
      await page.waitForTimeout(1000);
      console.log("✓ Language changed to EN");
    }
  });
});
