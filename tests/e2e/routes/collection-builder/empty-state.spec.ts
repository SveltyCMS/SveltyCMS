/**
 * @file tests/e2e/routes/collection-builder/empty-state.spec.ts
 * @description E2E tests for the Collection Builder empty state — when no collections
 * exist yet, the EmptyState component should render with working buttons.
 *
 * ### Coverage:
 * - EmptyState renders when no collections exist
 * - "Add Collection" button navigates to /config/collectionbuilder/new
 * - "Add Category" button opens category modal
 * - "Load Preset" button opens preset modal
 * - "Quick Start" button opens quick-start modal
 * - Preset template installation creates collections
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin, ADMIN_CREDENTIALS } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

test.describe("Collection Builder — Empty State", () => {
  // These tests assert the empty state renders, which only happens when no
  // collections exist. Other builder specs (builder/collection/journey) create
  // collections in the same shared DB. Even with workers:1, those collections
  // persist into this file. Reset + seed before running so we start clean.
  test.beforeAll(async ({ request }) => {
    // The `reset` action only wipes the DB; collection schema files live on
    // disk under config/collections and config/global/collections and survive
    // a DB reset. `delete-all-collections` removes those .ts files, then calls
    // `contentSystem.refresh()`. That refresh has a bootstrap path that
    // regenerates the .ts files from DB schemas IF the DB still has them
    // (engine.server.ts: refreshCollectionsCache → fileSchemas.length === 0
    // && dbSchemas.length > 0). So we MUST wipe the DB first (reset), then
    // delete the files (no DB schemas to regenerate from), then reseed auth.
    const resetResponse = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "reset" },
    });
    expect(resetResponse.ok()).toBeTruthy();

    const deleteRes = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "delete-all-collections" },
    });
    expect(deleteRes.ok()).toBeTruthy();

    const seedResponse = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "seed",
        email: ADMIN_CREDENTIALS.email,
        password: ADMIN_CREDENTIALS.password,
      },
    });
    expect(seedResponse.ok()).toBeTruthy();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("should show empty state when no collections exist", async ({ page }) => {
    await page.goto("/config/collectionbuilder");

    // EmptyState should render with the blueprint illustration
    await expect(page.getByText(/blueprint is empty/i)).toBeVisible({
      timeout: 10_000,
    });

    // All action buttons should be visible
    await expect(page.getByTestId("add-collection-button")).toBeVisible();
    await expect(page.getByTestId("add-category-button")).toBeVisible();
    await expect(page.getByRole("button", { name: /quick start/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /load preset/i })).toBeVisible();
  });

  test("should navigate to new collection from empty state", async ({ page }) => {
    await page.goto("/config/collectionbuilder");

    // Click "Add Collection" in empty state
    await page.getByTestId("add-collection-button").click();

    // Should navigate to the collection editor
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("collection-name-input")).toBeVisible();
  });

  test("should open Quick Start modal from empty state", async ({ page }) => {
    await page.goto("/config/collectionbuilder");

    // Click Quick Start
    await page.getByRole("button", { name: /quick start/i }).click();

    // Modal should open with template cards.
    // The modal renders as two nested role="dialog" elements (a native
    // <dialog> wrapper + an inner div.modal-quick-start), so getByRole
    // hits a strict-mode violation. Target the unique class instead.
    const quickStartModal = page.locator("div.modal-quick-start");
    await expect(quickStartModal).toBeVisible({
      timeout: 5_000,
    });

    // Template cards should be visible (5 presets: blog, agency, saas, corporate, ecommerce)
    await expect(page.getByRole("radio", { name: /blog/i })).toBeVisible({ timeout: 5_000 });

    // Close the modal
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(quickStartModal).not.toBeVisible();
  });

  test("should install a Quick Start template from empty state", async ({ page }) => {
    await page.goto("/config/collectionbuilder");

    // Open Quick Start
    await page.getByRole("button", { name: /quick start/i }).click();

    // Select the Blog template
    await page.getByRole("radio", { name: /blog/i }).click();

    // Click Install. The button's accessible name (aria-label) is
    // "Install selected template collections" — the visible text "Install
    // Template" is NOT what getByRole({name}) matches. Match the aria-label.
    await page.getByRole("button", { name: /install selected template/i }).click();

    // Should get a success toast. The server returns
    // `Created ${n} collections: ${names}` — NOT "Collections created
    // successfully" (that's only the client-side fallback if result.message
    // is empty). Match the actual server message.
    await expect(page.getByText(/created \d+ collections/i)).toBeVisible({
      timeout: 15_000,
    });

    // The modal's close handler calls `window.location.reload()`. After reload,
    // the sidebar (which reads from the in-memory contentStore, populated from
    // the compiled .js files) should list the newly-installed collections.
    //
    // NOTE: the builder BOARD (`data-testid="collection-builder-board"`) reads
    // `currentConfig` from the page load → `getContentStructureFromDatabase` →
    // the `content_nodes` DB table. The install flow
    // (`installTemplateCollections`) writes schema files + compiles them +
    // refreshes the in-memory contentStore, but does NOT write `content_nodes`
    // entries (those are created by user "Save" actions in the builder, which
    // build the organizational tree). So the board still shows the empty state
    // after install — only the sidebar reflects the new collections. This
    // matches the setup wizard's `seedPresetCollections`, which also doesn't
    // write content_nodes. Assert the sidebar, not the board.
    const sidebarTree = page.getByRole("tree", { name: /collection tree/i });
    await expect(sidebarTree).toBeVisible({ timeout: 10_000 });
    await expect(sidebarTree.getByText(/posts/i)).toBeVisible({ timeout: 10_000 });
  });
});
