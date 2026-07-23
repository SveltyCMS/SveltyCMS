/**
 * @file tests/e2e/routes/collection-builder/builder.spec.ts
 * @description Collection Builder E2E — Testing 2026 pattern (webhooks reference).
 *
 * **One domain → shell guard + one golden journey.** Do not re-grow a 9-file suite.
 *
 * | Layer | Coverage |
 * | ----- | -------- |
 * | E2E shell | Board / add-collection chrome |
 * | E2E golden | Schema → entry → API (full lifecycle) |
 * | Unit | collectionbuilder-utils, page.server |
 * | Integration | collection-structure, structure-persistence*, code-gui-parity |
 *
 * Demoted from E2E (do not re-add without ADR review):
 * empty-state, structure-persistence UI, federation, widget toggles, field reorder,
 * extensions widget catalog, entry publish UI (API status asserted in golden).
 */

import { expect, test } from "@playwright/test";
import { resetAndSeedDatabase } from "../../helpers/api";
import {
  addInputField,
  openCollectionEntries,
  openNewCollectionEditor,
  saveCollectionSchema,
  uniqueCollectionFixture,
} from "../../helpers/collection-builder-flow";

test.describe.configure({ timeout: 120_000 });

test.describe("Collection Builder (Testing 2026 — shell + golden)", () => {
  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase(page);
  });

  /**
   * Shell guard — primary chrome only.
   * Matches ADR: minimal testids, no soft-skip.
   */
  test("shell: page title and new collection control", async ({ page }) => {
    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /collection builder/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page
        .getByTestId("collection-builder-board")
        .or(page.getByTestId("add-collection-button").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    const addCollection = page.getByTestId("add-collection-button").first();
    await expect(addCollection).toBeVisible({ timeout: 10_000 });
    await addCollection.click();
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 15_000 });
    await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Golden journey — sole mutation/outcome proof for this domain.
   * Builder → schema (Input field) → save → entry → list → API body.
   */
  test("golden: schema → entry → API", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    const fixture = uniqueCollectionFixture("Golden");
    await openNewCollectionEditor(page);
    await page.getByTestId("collection-name-input").fill(fixture.name);
    await addInputField(page, { label: "Title", fieldName: "title" });
    await saveCollectionSchema(page);

    await openCollectionEntries(page, fixture.slug);

    const createBtn = page
      .getByTestId("entry-list-action-create")
      .or(page.getByRole("button", { name: /create/i }))
      .or(page.locator("a[href*='create=true']"))
      .first();
    await expect(
      createBtn,
      `Expected entry list or create control for collection "${fixture.slug}" after schema save`,
    ).toBeVisible({ timeout: 20_000 });
    await createBtn.click({ force: true });

    await page.getByRole("textbox", { name: "Title" }).fill("Golden Entry");
    await page.getByRole("button", { name: /save/i }).first().click();

    // List may truncate cell text — assert a data row with status affordance
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: /unpublish|publish|draft/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // API is source of truth for field value + default status (not UI publish toggle)
    await expect(async () => {
      const apiRes = await page.request.get(
        `/api/collections/${fixture.slug}?publicationFilter=all&bypassCache=true`,
      );
      expect(apiRes.ok()).toBeTruthy();
      const body = await apiRes.json();
      const entry = (body.data ?? []).find((e: any) => {
        const v = e.title;
        const text = typeof v === "string" ? v : (v?.en ?? v?.[Object.keys(v ?? {})[0]]);
        return text === "Golden Entry";
      });
      expect(entry).toBeDefined();
      expect(entry.status).toBe("unpublish");
    }).toPass({ timeout: 25_000 });
  });
});
