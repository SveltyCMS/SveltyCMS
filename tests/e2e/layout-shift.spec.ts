/**
 * @file tests/e2e/layout-shift.spec.ts
 * @description Post-hydration layout-stability guards for the admin shell.
 *
 * Pins the 2026-10-21 layout-shift audit:
 *
 * | Screen                     | Regression guarded                                       |
 * | -------------------------- | -------------------------------------------------------- |
 * | mobile `/config`           | SSR paints the 1024px shell, then hydration removes the   |
 * |                            | inline sidebars (fixed with `max-md:hidden` + a seeded    |
 * |                            | `screen` store)                                           |
 * | collection list            | list settings (density / columns / order) were read in a  |
 * |                            | post-mount effect, so the table repainted after hydration |
 * | collection list (SSR only) | `displayTableHeaders` started empty, so the server        |
 * |                            | emitted a table without columns                           |
 * | media gallery              | table chunk + selection chrome must not reflow the grid   |
 *
 * CLS is measured with Chromium's `layout-shift` PerformanceObserver. The
 * observation window is bounded (not a fixed state wait): a shift that happens
 * after the window is simply outside the contract this spec asserts.
 */

import { expect, test, type Page } from "@playwright/test";
import { TEST_API_HEADERS } from "./helpers/api";
import { ADMIN_CREDENTIALS, loginAsAdmin, waitForHydration } from "./helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "./helpers/cookie-consent";
import {
  expectLayoutShiftBelow,
  installLayoutShiftObserver,
  readLayoutShift,
  resetLayoutShift,
} from "./helpers/layout-shift";

test.describe.configure({ mode: "serial", timeout: 120_000 });

/** CLS budget for a screen that is supposed to be settled before we look. */
const CLS_BUDGET = 0.05;
/** Observation window — long enough for post-hydration effects to flush. */
const OBSERVE_MS = 750;

async function seedCollection(page: Page): Promise<{ collectionId: string; entryId: string }> {
  const collectionId = `e2e_cls_${Date.now().toString(36)}`;
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "create-collection",
      schema: {
        _id: collectionId,
        name: collectionId,
        path: `/collection/${collectionId}`,
        fields: [
          { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
          { db_fieldName: "body", label: "Body", widget: { Name: "RichText" }, type: "string" },
        ],
      },
    },
  });
  expect(response.ok(), `create-collection failed: ${response.status()}`).toBeTruthy();

  // One row so the list renders the table instead of the empty state.
  const insert = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "insert",
      collectionId,
      data: { title: "Layout shift fixture", status: "publish" },
    },
  });
  expect(insert.ok(), `insert failed: ${insert.status()}`).toBeTruthy();
  const insertBody = (await insert.json().catch(() => null)) as { data?: { _id?: unknown } } | null;

  return { collectionId, entryId: String(insertBody?.data?._id ?? "") };
}

test.describe("Layout stability", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page);
    await dismissCookieConsent(page);
  });

  test("mobile shell renders one stable layout through hydration", async ({ page }) => {
    // Phone width: the server always renders the desktop branch (no viewport
    // on the server), so this window covers the SSR → mobile reconciliation.
    await page.setViewportSize({ width: 390, height: 844 });

    await installLayoutShiftObserver(page);
    await page.goto("/en/config", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // The mobile drawer must not be open on a cold load (it would overlay the
    // content), and the inline sidebars must be laid out away from the flow.
    const inlineAside = page.locator("aside.max-h-dvh").first();
    await expect(page.getByRole("main")).toBeVisible();

    await page.waitForTimeout(OBSERVE_MS);
    const report = await readLayoutShift(page);

    expect(report.supported, "layout-shift observer unavailable in Chromium").toBe(true);

    const detail = report.entries
      .map(
        (entry) =>
          `${entry.value.toFixed(4)} @${Math.round(entry.startTime)}ms ← ${entry.sources.join(", ") || "unknown"}`,
      )
      .join("\n");
    expect(
      report.score,
      `mobile shell shifted during hydration (CLS ${report.score.toFixed(4)} > ${CLS_BUDGET})\n${detail}`,
    ).toBeLessThan(CLS_BUDGET);

    // No inline sidebar may be visible at phone width.
    if (await inlineAside.count()) {
      await expect(inlineAside).toBeHidden();
    }
  });

  test("collection list is populated before and stable after hydration", async ({ page }) => {
    const { collectionId } = await seedCollection(page);

    await installLayoutShiftObserver(page);
    await page.goto(`/en/collection/${collectionId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // The server must already emit real columns (the effect used to fill them
    // in only after hydration, a whole-table reflow).
    await expect(page.locator("thead th").first()).toBeVisible({ timeout: 20_000 });
    expect(await page.locator("thead th").count()).toBeGreaterThan(1);

    await resetLayoutShift(page);
    await expectLayoutShiftBelow(page, CLS_BUDGET, "collection list", OBSERVE_MS);
  });

  test("media gallery settles without reflowing the grid", async ({ page }) => {
    await installLayoutShiftObserver(page);
    await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.getByText("Media Root").first()).toBeVisible({ timeout: 20_000 });
    await resetLayoutShift(page);
    await expectLayoutShiftBelow(page, CLS_BUDGET, "media gallery", OBSERVE_MS);
  });
});

test.describe("Server-rendered collection table", () => {
  // No JavaScript: whatever is asserted here came from the SSR response.
  test.use({ javaScriptEnabled: false });

  test.beforeEach(async ({ page }) => {
    // Refresh the session through the API (no page JavaScript): the project's
    // storageState cookie can be rotated by earlier tests in the same run.
    const login = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "login",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    expect(login.ok(), `testing login failed: ${login.status()}`).toBeTruthy();
  });

  test("collection list emits its columns without hydration", async ({ page }) => {
    test.skip(
      test.info().project.name !== "chromium",
      "The seeded session lives in the chromium project's storage state",
    );

    // Seed through the API request context — no page JavaScript required.
    const { collectionId } = await seedCollection(page);

    await page.goto(`/en/collection/${collectionId}`, { waitUntil: "domcontentloaded" });
    expect(page.url()).not.toContain("/login");

    await expect(page.locator("thead th").first()).toBeVisible({ timeout: 20_000 });
    expect(await page.locator("thead th").count()).toBeGreaterThan(1);
  });

  test("edit route renders both sidebars without hydration", async ({ page }) => {
    test.skip(
      test.info().project.name !== "chromium",
      "The seeded session lives in the chromium project's storage state",
    );

    const { collectionId, entryId } = await seedCollection(page);
    expect(entryId, "inserted entry id").not.toBe("");

    // Desktop only: the right sidebar opens for edit mode while the left stays
    // full (compact left navigation is a tablet affordance, not a desktop one).
    // Both must already be in that state in the server response, otherwise a
    // cold edit load snaps them into place.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/collection/${collectionId}?edit=${entryId}`, {
      waitUntil: "domcontentloaded",
    });
    expect(page.url()).not.toContain("/login");

    const left = page.getByTestId("app-left-sidebar");
    const right = page.getByTestId("app-right-sidebar");
    await expect(left).toBeVisible({ timeout: 20_000 });
    await expect(right).toBeVisible({ timeout: 20_000 });

    const leftBox = await left.boundingBox();
    const rightBox = await right.boundingBox();
    // Full left navigation (>200px) and expanded right inspector (>200px).
    expect(leftBox?.width ?? 0).toBeGreaterThan(200);
    expect(rightBox?.width ?? 0).toBeGreaterThan(200);
  });
});
