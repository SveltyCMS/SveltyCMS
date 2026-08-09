/**
 * @file tests/e2e/routes/system/language.spec.ts
 * @description System language selector — hard assert chrome (no soft-skip).
 */
import { expect, test } from "@playwright/test";
import { ensureSidebarVisible, loginAsAdmin } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";

test.describe("System Language Change", () => {
  test.setTimeout(60_000);

  test("change system language between EN and DE", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page, /\/(admin|Collections|collectionbuilder|dashboard)/);
    await ensureSidebarVisible(page);
    await dismissCookieConsent(page);

    const trigger = page
      .getByTestId("language-selector-trigger")
      .or(page.getByTestId("language-selector"))
      .or(page.getByLabel(/select language/i))
      .first();

    await expect(
      trigger,
      "Language selector is core chrome — must be present when sidebar is open",
    ).toBeVisible({ timeout: 15_000 });

    // DE: open the dropdown, click the German option, assert the html lang attr.
    await trigger.click({ force: true });
    const deOption = page.getByRole("button", { name: /german|deutsch/i }).first();
    await expect(deOption).toBeVisible({ timeout: 5_000 });
    await deOption.click({ force: true });
    await expect(page.locator("html")).toHaveAttribute("lang", "de", { timeout: 5_000 });

    // EN: switch back and assert the html lang attr flips again.
    await trigger.click({ force: true });
    const enOption = page.getByRole("button", { name: /english|englisch/i }).first();
    await expect(enOption).toBeVisible({ timeout: 5_000 });
    await enOption.click({ force: true });
    await expect(page.locator("html")).toHaveAttribute("lang", "en", { timeout: 5_000 });
  });
});
