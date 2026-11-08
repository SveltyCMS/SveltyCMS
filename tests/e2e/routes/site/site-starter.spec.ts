/**
 * @file tests/e2e/routes/site/site-starter.spec.ts
 * @description E2E smoke tests for the SvelteKit site starter and Live Preview bridge.
 *
 * Seed-first policy: the website starter blueprint is created via the testing API
 * in beforeAll and its success is asserted — no soft-skips on seed availability.
 */

import { expect, test } from "../../fixtures";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/api";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";

test.describe("Site Starter", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

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
    // `pluginEnabled` is not asserted: the seed reads it from the process-wide
    // plugin registry, whose settings service can be bound to another worker's
    // DB under the parallel E2E harness, so the flag is not a reliable
    // idempotency signal. The Live Preview tab in the next test is the hard
    // outcome assertion: without the editable-website plugin it does not render.
  });

  test("guest sees seeded homepage at /", async ({ browser }) => {
    // A real guest must not inherit the admin storageState — otherwise / renders
    // the admin dashboard and the seeded public homepage is never exercised.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      const response = await page.goto("/", { waitUntil: "domcontentloaded" });
      // The Svedit renderer draws the hero as article text (no heading role),
      // so assert on the seeded content text itself — the outcome that matters.
      await expect(
        page.getByText(new RegExp(`welcome to ${SITE_NAME}`, "i")).first(),
        "guest must see the seeded homepage hero text at /",
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("body")).toContainText(new RegExp(`welcome to ${SITE_NAME}`, "i"), {
        timeout: 5_000,
      });

      // SSR must already carry the seeded page. A `$state` initialised empty and
      // filled by `$effect` never runs on the server: the HTML shipped the
      // no-page fallback ("Welcome to <SITE_NAME setting>") and only swapped in
      // the hero after hydration — two different Welcome renders, and nothing
      // for a crawler or a no-JS client.
      const ssrHtml = response ? await response.text() : "";
      expect(ssrHtml, "SSR must render the seeded homepage hero").toContain(
        `Welcome to ${SITE_NAME}`,
      );
      expect(ssrHtml, "SSR must not render the no-page fallback").not.toContain(
        "The SvelteKit site starter is active",
      );
    } finally {
      await context.close();
    }
  });

  test("admin can open pages collection and Live Preview tab", async ({ page }) => {
    page.on("pageerror", (err) => console.log(">>> BROWSER PAGE ERROR:", err));
    page.on("response", (res) => {
      if (res.status() >= 400) console.log(">>> HTTP ERROR:", res.status(), res.url());
    });
    await seedCookieConsent(page);
    await loginAsAdmin(page);
    await dismissCookieConsent(page);

    await page.goto("/en/collection/pages", { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/en/collection/pages");
      await dismissCookieConsent(page);
    }
    await expect(page).toHaveURL(/\/en\/collection\/pages/i, { timeout: 15_000 });

    // Seeded website starter pages: the Home entry is always present.
    // CI runs the shard with parallel workers sharing one preview process —
    // a concurrent worker's reset can invalidate shared state mid-load, so the
    // row wait retries with a fresh navigation (same toPass pattern as the
    // golden test's API poll; no fixed sleeps).
    const homeRow = page.getByRole("row").filter({ hasText: /home/i }).first();
    await expect(async () => {
      if (page.url().includes("/login")) {
        await loginAsAdmin(page, "/en/collection/pages");
        await dismissCookieConsent(page);
      } else {
        await page.goto("/en/collection/pages", { waitUntil: "domcontentloaded" });
        await dismissCookieConsent(page);
      }
      await expect(homeRow, "seeded Home entry must be listed in the pages collection").toBeVisible(
        {
          timeout: 10_000,
        },
      );
    }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
    await homeRow
      .getByText(/home/i)
      .first()
      .click()
      .catch(() => homeRow.click());

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

    // Trial active on fresh E2E seed → 200; expired license → 403; unconfigured secret in local preview → 503.
    expect([200, 403, 503]).toContain(apiRes.status());
  });
});
