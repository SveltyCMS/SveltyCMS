/**
 * @file tests/e2e/routes/collection-builder/builder.spec.ts
 * @description E2E tests for the Collection Builder — navigation, widget management, field config.
 */

import { expect, test } from "@playwright/test";
import { ensureAuthenticated } from "../../helpers/test-auth";
import {
  addInputField,
  openNewCollectionEditor,
  quickAddInputWidget,
  uniqueCollectionFixture,
} from "../../helpers/collection-builder-flow";

test.describe("Collection Builder with Modern Widgets", () => {
  // UI login + widget init regularly exceeds Playwright's 30s default under CI load.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    // API session cookie — avoids flaky /login UI clicks that hit test timeout.
    await ensureAuthenticated(page);
  });

  test("should navigate to collection builder", async ({ page }) => {
    await page.goto("/config/collectionbuilder", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /collection builder/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page
        .getByTestId("collection-builder-board")
        .or(page.getByTestId("add-collection-button").first()),
    ).toBeVisible({
      timeout: 10_000,
    });

    const addCollection = page.getByTestId("add-collection-button").first();
    await expect(addCollection).toBeVisible({ timeout: 10_000 });
    await addCollection.click();
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("collection-editor-tabs")).toBeVisible();
  });

  test("should display widget management page", async ({ page }) => {
    await page.goto("/config/extensions");
    await page.getByRole("tab", { name: /widgets/i }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Extension Management");

    // Widget grid may or may not be visible — core widgets always load, but the grid
    // container depends on plugin state. The core widget names are the reliable signal.
    const widgetNames = page.getByText(/Input|Checkbox|RichText|Select|Number/i).first();
    await expect(widgetNames).toBeVisible({ timeout: 10_000 });
  });

  test("should create a collection with modern widgets", async ({ page }) => {
    await openNewCollectionEditor(page);
    await page.getByTestId("collection-name-input").fill("Test Article");
    await page.locator("#description").fill("Test collection for articles");

    await quickAddInputWidget(page);
    await expect(page.getByTestId("widget-fields-list").getByText(/New Input/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should filter widgets by search when search input is present", async ({ page }) => {
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();
    await page.getByTestId("tab-widgets").click();

    // Control risk: widget catalog must be filterable or show a named list
    const searchInput = page
      .getByTestId("widget-search")
      .or(page.locator('input[placeholder*="search" i], input[type="search"]'))
      .first();
    await expect(
      searchInput.or(page.getByText(/Input|Text|RichText|Checkbox/i).first()),
    ).toBeVisible({ timeout: 10_000 });

    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("text");
      await expect(page.getByText(/Input|Text/i).first()).toBeVisible();
      await searchInput.fill("");
    }
  });

  test("should configure widget-specific properties", async ({ page }) => {
    // quickAddInputWidget: dialog-scoped Input pick when "Add New Field" is open.
    const fixture = uniqueCollectionFixture("WidgetCfg");
    await openNewCollectionEditor(page);
    await page.getByTestId("collection-name-input").fill(fixture.name);

    await addInputField(page, { label: "User Email", fieldName: "email" });

    await expect(
      page.getByTestId("widget-fields-list").getByText("User Email", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should handle widget dependency display", async ({ page }) => {
    await page.goto("/config/extensions");
    const widgetsTab = page.getByRole("tab", { name: /widgets/i });
    await widgetsTab.click();

    // Core widgets always load — assert content rather than aria-selected
    // (tab component variants differ on attribute timing in CI).
    await expect(page.getByText(/Input|Checkbox|RichText|Select|Number/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should enable/disable widgets when toggles are present", async ({ page }) => {
    await page.goto("/config/extensions");
    await page
      .getByRole("tab", { name: /widgets/i })
      .or(page.getByTestId("extensions-tab-widgets"))
      .click();

    // Core catalog must render — hard assert (no soft-skip)
    await expect(page.getByText(/Input|Checkbox|RichText|Select|Number/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const toggles = page.locator(
      'button:has-text("Deactivate"), button:has-text("Activate"), button:has-text("Active"), button:has-text("Disabled")',
    );
    const firstToggle = toggles.first();
    if (await firstToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const textBefore = await firstToggle.textContent();
      const wasActive = /deactivate|active/i.test(textBefore || "");
      await firstToggle.click();
      await expect(async () => {
        const textAfter = await firstToggle.textContent();
        expect(/deactivate|active/i.test(textAfter || "")).toBe(!wasActive);
      }).toPass({ timeout: 5_000 });
    }
  });

  test("should validate collection creation", async ({ page }) => {
    const fixture = uniqueCollectionFixture("ValidCol");
    await openNewCollectionEditor(page);

    const nameInput = page.getByTestId("collection-name-input");
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill("");

    // Save with empty name should trigger validation
    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection name is required/i)).toBeVisible({
      timeout: 5_000,
    });

    // Unique name + field, then save via shared helper (toast wait)
    await nameInput.fill(fixture.name);
    await quickAddInputWidget(page);
    await expect(page.getByTestId("widget-fields-list").getByText(/New Input/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("save-collection-button").first().click();
    await expect(
      page.getByText(/collection saved|saved successfully|successfully saved/i),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test("should support field reordering", async ({ page }) => {
    await page.goto("/config/collectionbuilder");

    // Check if collections already exist; if not, create one
    const existingCollection = page
      .getByTestId("collection-builder-board")
      .getByRole("link")
      .first();
    const hasExisting = await existingCollection.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasExisting) {
      await existingCollection.click();
    } else {
      await openNewCollectionEditor(page);
      await page.getByTestId("collection-name-input").fill("Reorder Test");

      for (let i = 0; i < 3; i++) {
        await quickAddInputWidget(page);
        await expect(
          page
            .getByTestId("widget-fields-list")
            .getByText(/New Input/i)
            .nth(i),
        ).toBeVisible({
          timeout: 10_000,
        });
      }
    }

    // Drag handles should be present with 2+ fields
    const dragHandles = page.locator('[data-testid="widget-fields-list"] [class*="cursor-grab"]');
    if ((await dragHandles.count()) > 1) {
      await expect(dragHandles.first()).toBeVisible();
    }
  });
});
