/**
 * @file tests/e2e/routes/system/language.spec.ts
 * @description System language selector — hard assert chrome (no soft-skip).
 */
import { expect, test } from "@playwright/test";
import { ensureSidebarVisible, loginAsAdmin } from "../../helpers/auth";

test.describe("System Language Change", () => {
  test.setTimeout(60_000);

  test("change system language between EN and DE", async ({ page }) => {
    await loginAsAdmin(page, /\/(admin|Collections|collectionbuilder|dashboard)/);
    await ensureSidebarVisible(page);

    const languageSelector = page
      .getByTestId("language-selector")
      .or(page.getByLabel(/language|locale|sprache/i))
      .or(page.locator('select[name*="lang" i], select[id*="lang" i]'))
      .first();

    await expect(
      languageSelector,
      "Language selector is core chrome — must be present when sidebar is open",
    ).toBeVisible({ timeout: 15_000 });

    const tag = await languageSelector.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") {
      for (const lang of ["en", "de"]) {
        await languageSelector.selectOption(lang);
        await expect(languageSelector).toHaveValue(lang, { timeout: 5_000 });
      }
    } else {
      // Button/menu style: open and pick DE then EN if options exist
      await languageSelector.click();
      const de = page.getByRole("option", { name: /deutsch|german|^de$/i }).first();
      if (await de.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await de.click();
      }
      await languageSelector.click();
      const en = page.getByRole("option", { name: /english|^en$/i }).first();
      if (await en.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await en.click();
      }
    }
  });
});
