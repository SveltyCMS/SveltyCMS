/**
 * @file tests/e2e/routes/config/email-previews-audit.spec.ts
 * @description Browser contract for the Email Previews screen (`/email-previews`,
 * reached from Config → Email Previews). Pins that the page renders at least one
 * server-rendered preview and that switching templates does not 500 or throw.
 *
 * The zero-error guard is attached explicitly (idempotent with the base fixture)
 * and asserted after the switch so a server error during template re-render fails
 * the contract rather than surfacing as a silent console error.
 */

import { test, expect, type Page } from "../../fixtures";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { attachZeroErrorGuard, assertNoZeroErrors } from "../../helpers/zero-error-guard";

async function openEmailPreviews(page: Page): Promise<void> {
  await seedCookieConsent(page);
  await loginAsAdmin(page);

  await page.goto("/email-previews", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await dismissCookieConsent(page);

  await expect(page.getByTestId("email-previews-layout")).toBeVisible({ timeout: 25_000 });
  await waitForHydration(page);
}

test.describe("Email Previews", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    attachZeroErrorGuard(page);
  });

  test("renders at least one server-rendered preview", async ({ page }) => {
    await openEmailPreviews(page);

    await expect(page.getByTestId("email-previews-list")).toBeVisible();
    await expect(page.getByTestId("email-previews-frame")).toBeVisible();

    const iframe = page.locator('iframe[title^="Preview of"]');
    await expect(iframe).toBeVisible({ timeout: 15_000 });
    const srcdoc = await iframe.getAttribute("srcdoc");
    expect(srcdoc, "preview iframe must render server-side HTML").toBeTruthy();
  });

  test("switches previews without a 500 or throw", async ({ page }) => {
    await openEmailPreviews(page);

    const links = page.getByTestId("email-previews-list").getByRole("link");
    await expect(links.first()).toBeVisible({ timeout: 15_000 });
    const count = await links.count();
    expect(count, "email template list must contain more than one template").toBeGreaterThan(1);

    const iframe = page.locator('iframe[title^="Preview of"]');
    await expect(iframe).toBeVisible();
    const beforeTitle = await iframe.getAttribute("title");

    // Switch to a template that is not the current default.
    await links.nth(1).click();
    await expect(page).toHaveURL(/email=/, { timeout: 15_000 });

    await expect(iframe).toBeVisible({ timeout: 15_000 });
    await expect(iframe).not.toHaveAttribute("title", beforeTitle ?? "__absent__");

    // Explicit checkpoint: no uncaught error, console error, or 5xx during the switch.
    assertNoZeroErrors(page);
  });
});
