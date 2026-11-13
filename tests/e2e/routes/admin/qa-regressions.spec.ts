/**
 * @file tests/e2e/routes/admin/qa-regressions.spec.ts
 * @description Browser-only regressions from the Nov-2026 manual QA audit.
 *
 * The source scanners (`scan-security-risk`, `slop-scanner`, `lint:*`) model
 * sinks, secrets and patterns. They cannot see a state machine that never
 * advances, a control that throws on click, or a preference that is computed
 * but never applied. These three cases were reported as defects and are only
 * provable in a real browser, so they get a browser assertion instead of a
 * comment in the report.
 *
 * ### Features:
 * - SV-054: the table/card toggle mutates the view (the old code wrote to a
 *   getter-only accessor and threw `TypeError` before the change was applied)
 * - SV-084: the high-contrast preference reaches `<html data-contrast="high">`
 * - SV-087: the 404 page renders exactly one heading (it used to repeat the
 *   same copy in the page title, an `<h2>` and the summary)
 */

import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { TEST_API_HEADERS, ensureAuthenticated, resetAndSeedDatabase } from "../../helpers/api";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { assertNoZeroErrors, attachZeroErrorGuard } from "../../helpers/zero-error-guard";

test.describe.configure({ mode: "serial", timeout: 120_000 });

/**
 * A collection with one row: the list renders the real table instead of the
 * empty state, so the view toggle is reachable.
 */
async function seedCollection(page: Page): Promise<string> {
  const collectionId = `e2e_qa_${Date.now().toString(36)}`;
  const created = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "create-collection",
      schema: {
        _id: collectionId,
        name: collectionId,
        path: `/collection/${collectionId}`,
        fields: [
          { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
        ],
      },
    },
  });
  expect(created.ok(), `create-collection failed: ${created.status()}`).toBeTruthy();

  const inserted = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "insert",
      collectionId,
      data: { title: "QA regression fixture", status: "publish" },
    },
  });
  expect(inserted.ok(), `insert failed: ${inserted.status()}`).toBeTruthy();
  return collectionId;
}

test.beforeEach(async ({ page }) => {
  await seedCookieConsent(page);
  await resetAndSeedDatabase(page);
  await dismissCookieConsent(page);
  await ensureAuthenticated(page);
});

test.describe("QA audit regressions — browser-only", () => {
  test("SV-054: switching to card view changes the view without a runtime error", async ({
    page,
  }) => {
    attachZeroErrorGuard(page);
    const collectionId = await seedCollection(page);
    await page.goto(`/en/collection/${collectionId}`, { waitUntil: "domcontentloaded" });

    // The tooltip wrapper also exposes `role="button"`, so match the real
    // control by its tag + aria-label rather than by role alone.
    const toCard = page.locator('button[aria-label="Switch to card view"]');
    await expect(toCard).toBeVisible({ timeout: 30_000 });
    await toCard.click();

    // The label flips only if the controller accepted the new mode — the old
    // getter-only accessor threw before it did.
    await expect(page.locator('button[aria-label="Switch to table view"]')).toBeVisible({
      timeout: 15_000,
    });

    assertNoZeroErrors(page);
  });

  test("SV-084: the high-contrast preference reaches the document root", async ({ page }) => {
    await page.goto("/user", { waitUntil: "domcontentloaded" });

    const settingsTab = page.getByRole("tab", { name: /settings|einstellungen/i });
    await expect(settingsTab).toBeVisible({ timeout: 20_000 });
    if ((await settingsTab.getAttribute("aria-selected")) !== "true") {
      await settingsTab.click({ timeout: 10_000 });
    }
    await expect(settingsTab).toHaveAttribute("aria-selected", "true", { timeout: 5_000 });

    // `Toggle` renders `role="switch"`; a plain label match would also hit the
    // neighbouring help icon (its aria-label mentions high contrast too).
    const toggle = page.getByRole("switch", { name: /high contrast|hoher kontrast/i });
    await expect(toggle).toBeVisible({ timeout: 15_000 });

    const save = page.getByTestId("user-save-appearance-btn");
    await expect(save).toBeVisible({ timeout: 10_000 });

    await toggle.click();
    await save.click();
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high", {
      timeout: 15_000,
    });

    // Restore the default so the preference does not leak into later specs.
    await toggle.click();
    await save.click();
    await expect(page.locator("html")).not.toHaveAttribute("data-contrast", "high", {
      timeout: 15_000,
    });
  });

  test("SV-087: the 404 page states the failure once", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-qa", { waitUntil: "domcontentloaded" });

    const headings = page.getByRole("heading", { name: /page not found|seite nicht gefunden/i });
    await expect(headings).toHaveCount(1, { timeout: 20_000 });
  });

  test("SV-072: the media toolbar fits a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });

    // The search field is the control the audit saw truncated to "Search media... (".
    await expect(page.locator("#media-gallery-search")).toBeVisible({ timeout: 30_000 });

    // A wrapped toolbar is fine; a horizontally scrolling page is not.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows horizontally by ${overflow}px at 375px`).toBeLessThanOrEqual(
      1,
    );
  });
});
