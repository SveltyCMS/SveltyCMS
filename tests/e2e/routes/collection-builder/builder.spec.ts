/**
 * @file tests/e2e/routes/collection-builder/builder.spec.ts
 * @description Collection Builder E2E — Testing 2026 pattern (webhooks reference).
 *
 * **One domain → shell + one structure journey + one golden.** Do not re-grow a 9-file suite.
 *
 * | Layer | Coverage |
 * | ----- | -------- |
 * | E2E shell | Board / add-collection chrome |
 * | E2E structure | Category create → reload persistence |
 * | E2E golden | Schema → entry → API (full lifecycle) |
 * | Unit | collectionbuilder-utils, page.server |
 * | Integration | collection-structure, structure-persistence*, code-gui-parity |
 *
 * Demoted from E2E (do not re-add without ADR review):
 * empty-state, federation, widget toggles, field reorder,
 * extensions widget catalog, entry publish UI (API status asserted in golden).
 */

import { expect, test } from "@playwright/test";
import { resetAndSeedDatabase } from "../../helpers/api";
import {
  addInputField,
  collectionSlugCandidates,
  createPersistedCategory,
  goToWidgetsTab,
  openCollectionEntries,
  openNewCollectionEditor,
  saveCollectionSchema,
  uniqueCollectionFixture,
} from "../../helpers/collection-builder-flow";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("Collection Builder (Testing 2026 — shell + golden)", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
  });

  /**
   * Shell guard — primary chrome only.
   * Matches ADR: minimal testids, no soft-skip.
   */
  test("shell: page title and new collection control", async ({ page }) => {
    await expect(async () => {
      await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
      if (page.url().includes("/login")) {
        const { loginAsAdmin } = await import("../../helpers/auth");
        await loginAsAdmin(page, "/config/collectionbuilder");
      }
      await expect(
        page
          .getByRole("heading", { level: 1, name: /collection builder|sammlungsersteller/i })
          .or(page.getByTestId("page-title"))
          .or(page.getByTestId("admin-page-title"))
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 45_000, intervals: [2_000, 3_000, 5_000] });
    await expect(
      page
        .getByTestId("collection-builder-board")
        .or(page.getByTestId("add-collection-button").first())
        .first(),
    ).toBeVisible({ timeout: 30_000 });

    const addCollection = page.getByTestId("add-collection-button").first();
    await expect(addCollection).toBeVisible({ timeout: 10_000 });
    await addCollection.click();
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 15_000 });
    await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Soft-refresh contract — save must not hard-reload the document (session/consent stay).
   * Complements ContentSync `collection-save` + `invalidate("app:content")` path.
   */
  test("soft-refresh: schema save keeps session shell (no hard navigation to login)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    const fixture = uniqueCollectionFixture("SoftHmr");
    await openNewCollectionEditor(page);

    const nameInput = page.getByTestId("collection-name-input");
    await nameInput.click();
    await nameInput.fill(fixture.name);
    await nameInput.blur();
    await addInputField(page, { label: "Title", fieldName: "title" });
    // Wait for define step + store sync so Save enables (name !== "new" and fields.length > 0)
    await expect(
      page.locator('[data-testid="save-collection-button"]:not([disabled])').first(),
    ).toBeVisible({ timeout: 15_000 });

    // Marker survives SPA invalidate/goto; wiped only by full document reload
    await page.evaluate(() => {
      (window as unknown as { __SVELTY_SOFT_HMR_MARK?: number }).__SVELTY_SOFT_HMR_MARK = 42;
    });

    await saveCollectionSchema(page);

    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    // Still in collection builder (edit URL ok after first save of a new collection)
    await expect(page).toHaveURL(/\/config\/collectionbuilder\//, { timeout: 10_000 });

    const mark = await page.evaluate(
      () => (window as unknown as { __SVELTY_SOFT_HMR_MARK?: number }).__SVELTY_SOFT_HMR_MARK,
    );
    expect(mark, "Expected in-page mark after schema save (soft invalidate, not hard reload)").toBe(
      42,
    );
  });

  /**
   * Structure persistence — category create → reload → still on the board.
   * Complements integration structure-persistence tests with a real UI save.
   */
  test("structure: category create survives reload", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: /collection builder/i })).toBeVisible({
      timeout: 30_000,
    });

    const fixture = uniqueCollectionFixture("Cat");
    await createPersistedCategory(page, fixture.name);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /collection builder/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(fixture.name, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  /**
   * Golden journey — sole mutation/outcome proof for this domain.
   * Builder → schema (Input field) → save → entry → list → API body.
   */
  test("golden: schema → entry → API", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    await dismissCookieBannerIfPresent(page);

    // Prefix without `_` — product path slug strips underscores (see collection-form)
    const fixture = uniqueCollectionFixture("Golden");
    await openNewCollectionEditor(page);
    const nameInput = page.getByTestId("collection-name-input");
    await nameInput.click();
    await nameInput.fill(fixture.name);
    await nameInput.blur();
    await addInputField(page, { label: "Title", fieldName: "title" });
    await saveCollectionSchema(page);

    // Soft HMR: still authenticated after schema compile
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Poll API until registered, then open entry list (canonical path preferred)
    await openCollectionEntries(page, fixture.slug);
    await dismissCookieBannerIfPresent(page);

    // EntryListMultiButton renders data-testid="entry-list-action-create" for empty collections.
    // Retry with fresh navigation: in CI, parallel workers share one preview
    // process and a concurrent reset can invalidate shared state mid-load
    // (same toPass pattern as the API poll below).
    const createBtn = page
      .getByTestId("entry-list-action-create")
      .or(page.getByRole("button", { name: /create new entry|create/i }))
      .first();
    await expect(async () => {
      await openCollectionEntries(page, fixture.slug);
      await expect(
        createBtn,
        `Expected entry list or create control for collection "${fixture.slug}" after schema save`,
      ).toBeVisible({ timeout: 10_000 });
    })
      .toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] })
      .catch(async (err) => {
        // CI diagnostics: the public annotations carry this message, so a
        // Linux-only render failure becomes debuggable without the artifacts.
        const url = page.url();
        const body =
          (await page
            .locator("body")
            .innerText()
            .catch(() => "<body unavailable>")) || "";
        throw new Error(
          `[E2E-DIAG] entry list never rendered\nURL: ${url}\nBody (first 1200 chars):\n${String(body).slice(0, 1200)}\n\nOriginal error: ${(err as Error).message}`,
        );
      });
    const titleBox = page
      .getByRole("textbox", { name: /^title$/i })
      .or(page.getByLabel(/^title$/i))
      .or(page.getByTestId("widget-input-title"))
      .or(page.locator('input[name="title"], textarea[name="title"]').first())
      .first();

    // Guard against SSR hydration race where early click on Create button is a silent no-op
    await expect(async () => {
      if (!(await titleBox.isVisible())) {
        await createBtn.click({ timeout: 5_000 });
      }
      await expect(titleBox, "Title field on entry form").toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000, intervals: [1_000, 2_000] });

    await titleBox.click();
    await titleBox.fill("Golden Entry");
    await titleBox.blur();
    const saveBtn = page.getByRole("button", { name: /save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 15_000 });
    await expect(saveBtn).toBeEnabled({ timeout: 15_000 });
    await saveBtn.click();

    // Save is async and navigates back to the list only after the write resolves.
    await Promise.race([
      expect(page.getByText(/entry saved/i).first()).toBeVisible({ timeout: 25_000 }),
      page.waitForURL((url) => !url.searchParams.has("create") && !url.searchParams.has("edit"), {
        timeout: 25_000,
      }),
    ]);

    // Assert a data row with status affordance. Retry: a parallel-worker reset or
    // one extra navigation round-trip can leave the freshly saved entry out of the
    // first SSR render, so re-navigate inside the retry to force a fresh list read.
    await expect(async () => {
      await openCollectionEntries(page, fixture.slug);
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: /unpublish|publish|draft|golden entry/i })
          .first(),
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000, intervals: [1_500, 2_500, 4_000] });

    // API is source of truth — try product path + hyphen/underscore variants
    const apiIds = collectionSlugCandidates(fixture.slug);
    await expect(async () => {
      let entry: any;
      let lastStatus = 0;
      for (const id of apiIds) {
        const apiRes = await page.request.get(
          `/api/collections/${id}?publicationFilter=all&bypassCache=true`,
        );
        lastStatus = apiRes.status();
        if (!apiRes.ok()) continue;
        const body = await apiRes.json();
        const rows = Array.isArray(body.data)
          ? body.data
          : Array.isArray(body)
            ? body
            : body.data
              ? [body.data]
              : [];
        entry = rows.find((e: any) => {
          const v = e?.title ?? e?.data?.title;
          const text = typeof v === "string" ? v : (v?.en ?? v?.[Object.keys(v ?? {})[0]] ?? "");
          return String(text) === "Golden Entry";
        });
        if (entry) break;
      }
      expect(
        entry,
        `Golden Entry not in API for ids=${apiIds.join(",")} lastStatus=${lastStatus}`,
      ).toBeDefined();
      // Default status is unpublish; accept draft synonyms if product renames later
      expect(["unpublish", "unpublished", "draft"]).toContain(String(entry.status).toLowerCase());
    }).toPass({ timeout: 35_000, intervals: [1_500, 2_500, 4_000] });
  });

  /**
   * Smart Quick-Add & Code Split-View — natural-language inference & live reactive schema code.
   */
  test("smart quick-add & split-view: natural language inference & live TS code", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const fixture = uniqueCollectionFixture("Split");
    await openNewCollectionEditor(page);
    const nameInput = page.getByTestId("collection-name-input");
    await nameInput.click();
    await nameInput.fill(fixture.name);
    await nameInput.blur();

    await goToWidgetsTab(page);

    // Quick-Add field using natural-language input
    const quickInput = page.getByTestId("quick-add-field-input");
    await expect(quickInput).toBeVisible({ timeout: 10_000 });
    await quickInput.click();
    await quickInput.fill("contact_email");

    // Inferred badge should appear
    await expect(page.getByText(/email/i).first()).toBeVisible({ timeout: 5_000 });

    // Click Add Field
    const quickAddBtn = page.getByTestId("quick-add-field-button");
    await expect(quickAddBtn).toBeEnabled({ timeout: 5_000 });
    await quickAddBtn.click();

    // Field row should be in canvas
    await expect(
      page.getByTestId("widget-field-row").filter({ hasText: /contact_email/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Switch to Split View
    const splitBtn = page.getByTestId("view-mode-split");
    await expect(splitBtn).toBeVisible({ timeout: 5_000 });
    await splitBtn.click();

    // Code pane should be visible with generated TypeScript schema
    const codePane = page.getByTestId("collection-code-pane");
    await expect(codePane).toBeVisible({ timeout: 10_000 });
    await expect(codePane).toContainText("contact_email");
    await expect(codePane).toContainText("defineCollection");

    // Switch to full TypeScript code view
    const codeModeBtn = page.getByTestId("view-mode-code");
    await codeModeBtn.click();
    await expect(codePane).toBeVisible({ timeout: 5_000 });
    // Visual canvas is hidden in full code mode
    await expect(page.getByTestId("widget-fields-list")).not.toBeVisible();

    // Switch back to Canvas mode
    const canvasModeBtn = page.getByTestId("code-view-mode-canvas");
    await canvasModeBtn.click();
    await expect(page.getByTestId("widget-fields-list")).toBeVisible({ timeout: 5_000 });
    await expect(codePane).not.toBeVisible();
  });

  /**
   * Database Schema Ingestion & Introspection — DDL SQL reverse-engineering into collections.
   */
  test("schema ingestion: introspect DDL SQL to new collection", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    const ingestBtn = page
      .getByTestId("introspect-schema-button")
      .or(page.getByTestId("open-schema-ingestion-button"))
      .first();
    await expect(ingestBtn).toBeVisible({ timeout: 15_000 });
    await ingestBtn.click();

    const modal = page.getByTestId("modal-schema-ingestion");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Load example SQL DDL
    const loadExampleBtn = page.getByTestId("ingest-load-sql-example");
    await expect(loadExampleBtn).toBeVisible({ timeout: 5_000 });
    await loadExampleBtn.click();

    // Submit ingestion
    const submitBtn = page.getByTestId("ingest-submit-button");
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Should redirect to new collection editor
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 15_000 });

    // Collection name should be pre-populated
    const nameInput = page.getByTestId("collection-name-input");
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await expect(nameInput).toHaveValue(/products/i);

    // Go to widgets tab and verify ingested fields exist
    await goToWidgetsTab(page);
    const fieldsList = page.getByTestId("widget-fields-list");
    await expect(fieldsList).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("widget-field-row").first()).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Unified Favorites & Tagging Workflow — star & tag in builder reflects in filters and sidebar.
   */
  test("favorites & tagging: mark favorite and tag in builder reflects in filters", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    const treeBoard = page.getByTestId("collection-builder-board");
    await expect(treeBoard).toBeVisible({ timeout: 20_000 });

    // Verify the sidebar quick-add link exists
    const sidebarLink = page.getByTestId("sidebar-collection-builder-link");
    await expect(sidebarLink).toBeVisible({ timeout: 10_000 });

    // Look for any tree item
    const firstItem = page.locator(".tree-item").first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });

    // Find and click the favorite star button on the row
    const starBtn = firstItem.getByRole("button", { name: /favorite/i }).first();
    await expect(starBtn).toBeVisible({ timeout: 5_000 });
    await starBtn.click();

    // Verify favorite icon has active warning-500 fill
    const starIcon = starBtn.locator("iconify-icon");
    await expect(starIcon).toHaveAttribute("icon", "bi:star-fill");

    // Click "Manage Tags" button on the row
    const tagBtn = firstItem.getByRole("button", { name: /manage tags/i }).first();
    await expect(tagBtn).toBeVisible({ timeout: 5_000 });
    await tagBtn.click();

    // Fill tag in modal
    const tagDialog = page.getByRole("dialog");
    await expect(tagDialog).toBeVisible({ timeout: 5_000 });

    const tagInput = tagDialog
      .getByPlaceholder(/news, blog/i)
      .or(tagDialog.getByRole("textbox"))
      .first();
    await expect(tagInput).toBeVisible({ timeout: 5_000 });
    await tagInput.fill("alpha-tag");

    // Click Save inside the dialog
    const saveTagBtn = tagDialog.getByRole("button", { name: "Save" });
    await saveTagBtn.click();

    // Tag badge should be visible on the node
    await expect(firstItem.getByText("alpha-tag")).toBeVisible({ timeout: 5_000 });

    // Click Favorites filter chip in toolbar
    const favFilterBtn = page.getByRole("button", { name: /filter by favorites/i });
    await expect(favFilterBtn).toBeVisible({ timeout: 5_000 });
    await favFilterBtn.click();

    // Favorited item remains visible
    await expect(firstItem).toBeVisible({ timeout: 5_000 });
  });
});
