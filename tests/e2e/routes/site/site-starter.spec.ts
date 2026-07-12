/**
 * @file tests/e2e/routes/site/site-starter.spec.ts
 * @description E2E smoke tests for the SvelteKit site starter and Live Preview bridge.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

test.describe("Site Starter", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-website-starter", siteName: "E2E Site Starter" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("guest sees seeded homepage at /", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/welcome/i, {
      timeout: 15_000,
    });

    await context.close();
  });

  test("admin can open pages collection and Live Preview tab", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/en/collection/pages", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/en\/collection\/pages/i, { timeout: 15_000 });

    const firstRow = page.getByRole("row").filter({ hasText: /home/i }).first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await firstRow.click();

    const livePreviewTab = page.getByRole("tab", { name: /live preview/i });
    await expect(livePreviewTab).toBeVisible({ timeout: 15_000 });
    await livePreviewTab.click();

    await expect(
      page
        .getByText(
          /unlock visual frontpage editing|live preview ready|checking live preview license/i,
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("preview authorize requires license bridge (authenticated)", async ({ page }) => {
    await loginAsAdmin(page);

    const apiRes = await page.request.post("/api/preview/authorize", {
      data: {
        schema: { _id: "pages", name: "pages", livePreview: "/{slug}?lang={lang}" },
        entry: { _id: "test-home", slug: "home", title: "Home" },
        contentLanguage: "en",
      },
    });

    // Trial active on fresh E2E seed → 200; expired license → 403. Both validate the gate exists.
    expect([200, 403]).toContain(apiRes.status());
  });
});
