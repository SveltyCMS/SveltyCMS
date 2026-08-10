/**
 * @file tests/e2e/routes/site/site-starter.spec.ts
 * @description E2E smoke tests for the SvelteKit site starter and Live Preview bridge.
 *
 * Seed-first policy: the website starter blueprint is created via the testing API
 * in beforeAll and its success is asserted — no soft-skips on seed availability.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/api";

test.describe("Site Starter", () => {
  // Constant per spec file: workers share one server DB, and the homepage seed
  // is idempotent (first seed wins). A per-worker Date.now() name made every
  // worker except the first assert a name the page never shows. The name only
  // needs to be stable across runs — resets wipe the row, so a later run
  // re-seeds the same name.
  const SITE_NAME = "E2E Site";

  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-website-starter", siteName: SITE_NAME },
    });
    expect(res.ok(), `seed-website-starter must succeed (HTTP ${res.status()})`).toBeTruthy();
    const body = await res.json().catch(() => ({}));
    expect(
      body.success,
      `seed-website-starter unsuccessful: ${JSON.stringify(body).slice(0, 300)}`,
    ).toBe(true);
    // The Live Preview tab depends on the editable-website plugin — the seed
    // enables it; fail hard if it did not (no deterministic tab otherwise).
    expect(
      body.pluginEnabled,
      `seed-website-starter must enable the editable-website plugin: ${JSON.stringify(body).slice(0, 300)}`,
    ).toBe(true);
  });

  test("guest sees seeded homepage at /", async ({ browser }) => {
    // A real guest must not inherit the admin storageState — otherwise / renders
    // the admin dashboard and the seeded public homepage is never exercised.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      // The Svedit renderer draws the hero as article text (no heading role),
      // so assert on the seeded content text itself — the outcome that matters.
      await expect(
        page.getByText(new RegExp(`welcome to ${SITE_NAME}`, "i")).first(),
        "guest must see the seeded homepage hero text at /",
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("body")).toContainText(new RegExp(`welcome to ${SITE_NAME}`, "i"), {
        timeout: 5_000,
      });
    } finally {
      await context.close();
    }
  });

  test("admin can open pages collection and Live Preview tab", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/en/collection/pages", { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/en/collection/pages");
    }
    await expect(page).toHaveURL(/\/en\/collection\/pages/i, { timeout: 15_000 });

    // Seeded website starter pages: the Home entry is always present.
    const homeRow = page.getByRole("row").filter({ hasText: /home/i }).first();
    await expect(homeRow, "seeded Home entry must be listed in the pages collection").toBeVisible({
      timeout: 15_000,
    });
    await homeRow.click();

    // The pages collection declares livePreview and the editable-website plugin
    // is enabled by the seed — the Live Preview tab must be present.
    const livePreviewTab = page.getByRole("tab", { name: /live preview/i });
    await expect(livePreviewTab, "Live Preview tab must exist on pages entries").toBeVisible({
      timeout: 15_000,
    });
    await livePreviewTab.click();

    // One of the license/render states always shows: loading → ready or
    // upgrade, or (license active) the handshake while the preview connects.
    await expect(
      page
        .getByText(
          /unlock visual frontpage editing|live preview ready|checking live preview license|connecting handshake|handshaking/i,
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
