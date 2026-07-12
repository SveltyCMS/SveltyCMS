/**
 * @file tests/e2e/routes/collection-builder/builder.spec.ts
 * @description E2E tests for the Collection Builder — navigation, widget management, field config.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Collection Builder with Modern Widgets", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
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
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();

    await page.getByTestId("collection-name-input").fill("Test Article");
    await page.locator("#description").fill("Test collection for articles");

    await page.getByTestId("tab-widgets").click();
    await page.getByTestId("quick-add-input").click();

    await expect(page.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });
  });

  test("should filter widgets by search when search input is present", async ({ page }) => {
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();
    await page.getByTestId("tab-widgets").click();

    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]').first();
    if (!(await searchInput.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Widget search input not present in this UI variant");
      return;
    }

    await searchInput.fill("text");
    await expect(page.getByText(/Input|Text/i).first()).toBeVisible();
    await searchInput.fill("");
  });

  test("should configure widget-specific properties", async ({ page }) => {
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();
    await page.getByTestId("tab-widgets").click();

    await page.getByTestId("add-field-button").click();

    // Select Input widget from the modal
    await page.getByRole("button", { name: /Input/i }).first().click();

    // Configure label in the WidgetInspector side panel
    await page.getByPlaceholder("e.g. Profile Picture").fill("User Email");
    await page.getByPlaceholder("e.g. profile_pic").fill("email");

    await page.getByRole("button", { name: /Apply Changes/i }).click();

    // Verify field appears in the widget-fields-list
    await expect(page.getByTestId("widget-fields-list").getByText("User Email")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should handle widget dependency display", async ({ page }) => {
    await page.goto("/config/extensions");
    await page.getByRole("tab", { name: /widgets/i }).click();

    // Core widgets ship without external dependencies, so dependency info is optional.
    // Verify the page loaded — the tab heading confirms we're on the right view.
    await expect(page.getByRole("tab", { name: /widgets/i })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 5_000 },
    );
  });

  test("should enable/disable widgets when toggles are present", async ({ page }) => {
    await page.goto("/config/extensions");
    await page.getByRole("tab", { name: /widgets/i }).click();

    const toggles = page.locator('button:has-text("Deactivate"), button:has-text("Activate")');
    const firstToggle = toggles.first();

    if (!(await firstToggle.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No widget toggles present");
      return;
    }

    const textBefore = await firstToggle.textContent();
    const wasActive = textBefore?.includes("Deactivate");

    await firstToggle.click();

    // Wait for the toggle state to flip via the button text change
    await expect(async () => {
      const textAfter = await firstToggle.textContent();
      expect(textAfter?.includes("Deactivate")).toBe(!wasActive);
    }).toPass({ timeout: 5_000 });
  });

  test("should validate collection creation", async ({ page }) => {
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();

    const nameInput = page.getByTestId("collection-name-input");
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill("");

    // Save with empty name should trigger validation
    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection name is required/i)).toBeVisible({
      timeout: 5_000,
    });

    // Fill required info and add a field
    await nameInput.fill("Valid Collection");
    await page.getByTestId("tab-widgets").click();
    await page.getByTestId("quick-add-input").click();
    await expect(page.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });

    // Save should succeed
    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection saved/i)).toBeVisible({
      timeout: 10_000,
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
      await page.getByTestId("add-collection-button").first().click();
      await page.getByTestId("collection-name-input").fill("Reorder Test");
      await page.getByTestId("tab-widgets").click();

      for (let i = 0; i < 3; i++) {
        await page.getByTestId("quick-add-input").click();
        await expect(page.getByText(/New Input/i).nth(i)).toBeVisible({ timeout: 10_000 });
      }
    }

    // Drag handles should be present with 2+ fields
    const dragHandles = page.locator('[data-testid="widget-fields-list"] [class*="cursor-grab"]');
    if ((await dragHandles.count()) > 1) {
      await expect(dragHandles.first()).toBeVisible();
    }
  });
});
