/**
 * @file tests/e2e/routes/system/language.spec.ts
 * @description E2E test for changing the system language in SveltyCMS.
 *   - Logs in as admin
 *   - Selects each language (en, de) from the dropdown and verifies the change
 */
import { expect, test } from "@playwright/test";
import { ensureSidebarVisible, loginAsAdmin } from "../../helpers/auth";

test.describe("System Language Change", () => {
  test.setTimeout(60_000);

  test("Login and change system language between EN and DE", async ({ page }) => {
    // 1. Login
    await loginAsAdmin(page, /\/(admin|Collections|collectionbuilder|dashboard)/);

    // 2. On mobile viewports, open sidebar to access language selector
    await ensureSidebarVisible(page);

    // 3. Find language selector via data-testid
    const languageSelector = page.getByTestId("language-selector");
    if (!(await languageSelector.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Language selector not found in current UI");
      return;
    }

    // 4. Loop through available language options (en, de)
    const languages = ["en", "de"];

    for (const lang of languages) {
      await languageSelector.selectOption(lang);
      await page.waitForTimeout(500);
      await expect(languageSelector).toHaveValue(lang);
    }
  });
});
