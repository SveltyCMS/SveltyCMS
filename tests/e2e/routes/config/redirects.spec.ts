/**
 * @file tests/e2e/routes/config/redirects.spec.ts
 * @description Redirects E2E — Testing 2026 golden journey + minimal shell.
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { confirmModal } from "../../helpers/confirm-modal";
import { dismissCookieBannerIfPresent, waitForAdminShell } from "../../helpers/stable";

const ACTION_TIMEOUT = 20_000;

async function goRedirects(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/redirects", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/config/redirects");
  }
  await dismissCookieBannerIfPresent(page);
  await waitForAdminShell(page, ACTION_TIMEOUT);
  await expect(page.getByTestId("page-title")).toContainText(/redirect/i, {
    timeout: ACTION_TIMEOUT,
  });
  await expect(page.getByTestId("redirects-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Redirect Manager (Testing 2026)", () => {
  test.setTimeout(120_000);

  test("shell: add control present", async ({ page }) => {
    await goRedirects(page);
    await expect(page.getByTestId("redirects-add")).toBeVisible();
  });

  test("golden: create → search → delete", async ({ page }) => {
    await goRedirects(page);

    const stamp = Date.now().toString(36).slice(-6);
    const fromPath = `/e2e-old-${stamp}`;
    const toPath = `/e2e-new-${stamp}`;

    await page.getByTestId("redirects-add").click();
    // Modal: testid first, role=dialog fallback (no class selectors)
    const modal = page
      .getByTestId("redirects-modal")
      .or(page.getByRole("dialog").filter({ hasText: /redirect|from|to/i }));
    await expect(modal.first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    const fromInput = page
      .getByTestId("redirect-from")
      .or(page.getByLabel(/from path/i))
      .first();
    const toInput = page
      .getByTestId("redirect-to")
      .or(page.getByLabel(/to path/i))
      .first();
    await expect(fromInput).toBeVisible({ timeout: ACTION_TIMEOUT });
    await fromInput.click();
    await fromInput.fill(fromPath);
    await toInput.click();
    await toInput.fill(toPath);

    // Submit form (type=submit) — prefer testid, avoid sticky-action duplicates with .first()
    await page.getByTestId("redirect-save").first().click();

    // Modal closes on success; poll for either close or error toast
    await expect(async () => {
      const open = await page
        .getByTestId("redirects-modal")
        .isVisible()
        .catch(() => false);
      if (!open) return;
      // If still open, show any validation error text for diagnostics
      const err = await page
        .getByRole("alert")
        .or(page.getByText(/required|invalid|failed/i))
        .first()
        .textContent()
        .catch(() => "");
      expect(open, `redirect modal still open after save. ${err || ""}`).toBe(false);
    }).toPass({ timeout: ACTION_TIMEOUT });

    await expect(page.getByText(fromPath).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    await page.getByTestId("redirects-search").fill(fromPath);
    await expect(page.getByText(fromPath).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    // data-* attribute contract — not CSS classes
    const row = page.locator(`[data-from="${fromPath}"]`).first();
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });
    const deleteBtn = row.getByTestId("redirect-delete");
    await deleteBtn.scrollIntoViewIfNeeded();
    // Table action cells can be clipped by overflow; force after scroll
    await deleteBtn.click({ force: true, timeout: ACTION_TIMEOUT });
    await confirmModal(page);
    await expect(page.locator(`[data-from="${fromPath}"]`)).toHaveCount(0, {
      timeout: ACTION_TIMEOUT,
    });
  });
});
