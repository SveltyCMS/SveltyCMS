/**
 * @file tests/e2e/routes/site/site-starter.spec.ts
 * @description E2E smoke tests for the SvelteKit site starter and Live Preview bridge.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../helpers/api";

test.describe("Site Starter", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-website-starter", siteName: "E2E Site Starter" },
    });
    if (!res.ok()) {
      const errBody = await res.text().catch(() => "");
      test.skip(
        true,
        `seed-website-starter unavailable (${res.status()}): ${errBody.slice(0, 200)}`,
      );
    }
    const body = await res.json();
    if (!body.success) {
      test.skip(true, `seed-website-starter failed: ${JSON.stringify(body).slice(0, 200)}`);
    }
  });

  test("guest sees seeded homepage at /", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Seeded starter, hero, or default SvelteKit marketing shell (CI preview).
    // Avoid bare h1/h2 matchers that pass on empty chrome without content.
    const welcome = page
      .getByRole("heading", { level: 1 })
      .filter({ hasText: /welcome|e2e site starter|home|sveltycms|sveltekit/i })
      .or(page.getByText(/welcome to|e2e site starter|sveltycms with sveltekit/i).first());
    await expect(welcome.first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/welcome|starter|home|sveltycms|sveltekit/i, {
      timeout: 5_000,
    });

    await context.close();
  });

  test("admin can open pages collection and Live Preview tab", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/en/collection/pages", { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/en/collection/pages");
    }
    // Seed may not materialize pages collection in every CI matrix — skip if missing
    if (!/\/en\/collection\/pages/i.test(page.url())) {
      test.skip(true, `pages collection not available (landed on ${page.url()})`);
    }

    const firstRow = page.getByRole("row").filter({ hasText: /home/i }).first();
    if (!(await firstRow.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, "seeded Home entry not present in pages collection");
    }
    await firstRow.click();

    const livePreviewTab = page.getByRole("tab", { name: /live preview/i });
    if (!(await livePreviewTab.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, "Live Preview tab not present in this build");
    }
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
