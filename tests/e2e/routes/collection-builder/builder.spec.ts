// tests/playwright/collection-builder.spec.ts
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Collection Builder with Modern Widgets", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin first
    await loginAsAdmin(page);
  });

  test("should navigate to collection builder", async ({ page }) => {
    await page.goto("/config/collectionbuilder");
    await expect(page.getByRole("heading", { level: 1, name: /collection builder/i })).toBeVisible({
      timeout: 10_000,
    });

    const addCollection = page.getByTestId("add-collection-button").first();
    await expect(addCollection).toBeVisible({ timeout: 10_000 });
    await addCollection.click();
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 10_000 });
    await expect(page.getByTestId("collection-editor-stepper")).toBeVisible();
  });

  test("should display widget management page", async ({ page }) => {
    // Navigate to widget management
    await page.goto("/config/extensions");
    await page.getByRole("tab", { name: /widgets/i }).click();

    await expect(page.locator("h1")).toContainText("Extension Management");

    // Check if widgets are loaded - use locator-based waitFor
    await page
      .locator('[data-testid="widget-grid"]')
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {
        console.log("[E2E] Widget list container not found, continuing...");
      });

    // Verify core widgets are visible using regex
    await expect(page.getByText(/textinput|checkbox|input/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should create a collection with modern widgets", async ({ page }) => {
    // Navigate to collection builder
    await page.goto("/config/collectionbuilder");

    // Start creating a new collection
    await page.getByTestId("add-collection-button").first().click();

    // Fill collection basic info
    await page.fill(
      'input[name="name"], input[placeholder*="name"], input[placeholder*="Name"]',
      "Test Article",
    );
    await page.fill(
      'input[name="description"], textarea[name="description"], input[placeholder*="description"]',
      "Test collection for articles",
    );

    // Navigate to fields/widgets tab
    const widgetTab = page.locator(
      'button:has-text("Fields"), button:has-text("Widgets"), .tab-widgets',
    );
    if (await widgetTab.isVisible()) {
      await widgetTab.click();
    }

    // Add a text field
    await page.click('button:has-text("Add Field"), button:has-text("Add Widget"), .add-field-btn');

    // Select a widget from the modal
    const widgetModal = page.locator('.modal, [data-testid="widget-select-modal"]');
    await widgetModal.waitFor({ state: "visible" });

    // Select text/input widget
    await page
      .getByRole("button", { name: /TextInput|Input/i })
      .first()
      .click();

    // Configure the field
    await page.fill('input[name="label"], input[placeholder*="label"]', "Article Title");
    await page.fill(
      'input[name="db_fieldName"], input[placeholder*="field"], input[placeholder*="name"]',
      "title",
    );
    await page.getByRole("checkbox", { name: /required/i }).check();

    // Save the field
    await page.click('button:has-text("Save"), button:has-text("Add")');

    // Verify field was added
    await expect(page.locator("text=Article Title")).toBeVisible();
  });

  test("should filter widgets by search", async ({ page }) => {
    // Navigate to collection builder and start creating
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();

    // Navigate to widgets and add field
    await page.click('button:has-text("Add Field"), button:has-text("Add Widget")');

    // Use search functionality
    const searchInput = page.locator(
      'input[placeholder*="search"], input[type="search"], .search-input',
    );
    if (await searchInput.isVisible()) {
      await searchInput.fill("text");

      // Verify search results
      await expect(page.getByText(/textinput|input|text/i).first()).toBeVisible();

      // Clear search
      await searchInput.fill("");
    }
  });

  test("should configure widget-specific properties", async ({ page }) => {
    // Navigate to collection builder
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();

    // Add a field
    await page.click('button:has-text("Add Field"), button:has-text("Add Widget")');

    // Select input widget
    await page
      .getByRole("button", { name: /TextInput|Input/i })
      .first()
      .click();

    // Configure specific properties
    await page.fill('input[name="label"]', "User Email");
    await page.fill('input[name="db_fieldName"]', "email");
    await page.fill('input[name="placeholder"]', "Enter your email");
    await page.fill('input[name="maxlength"]', "100");

    // Check advanced options tab if available
    const advancedTab = page.locator('button:has-text("Advanced"), button:has-text("Specific")');
    if (await advancedTab.isVisible()) {
      await advancedTab.click();

      // Configure advanced properties
      await page.check('input[name="required"]');
    }

    // Save field
    await page.click('button:has-text("Save")');

    // Verify field configuration
    await expect(page.locator("text=User Email")).toBeVisible();
  });

  test("should handle widget dependencies", async ({ page }) => {
    // Navigate to widget management
    await page.goto("/config/extensions");
    await page.getByRole("tab", { name: /widgets/i }).click();

    // Check if dependency information is shown
    const widgetItems = page.locator(".widget-item, .widget-card, [data-testid]").first();

    if (await widgetItems.isVisible().catch(() => false)) {
      // Look for dependency information using regex
      await expect(page.getByText(/dependencies|requires|depends/i).first()).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test("should enable/disable widgets", async ({ page }) => {
    // Navigate to widget management
    await page.goto("/config/extensions");
    await page.getByRole("tab", { name: /widgets/i }).click();

    // Find a custom widget toggle
    const toggles = page.locator('button:has-text("Deactivate"), button:has-text("Activate")');
    const firstToggle = toggles.first();

    if (await firstToggle.isVisible()) {
      const text = await firstToggle.textContent();
      const isActive = text?.includes("Deactivate");

      // Toggle the widget
      await firstToggle.click();

      // Wait for state change
      await page.waitForTimeout(2000);

      // Verify state changed
      const newText = await firstToggle.textContent();
      expect(newText?.includes("Deactivate")).toBe(!isActive);
    }
  });

  test("should validate collection creation", async ({ page }) => {
    // Navigate to collection builder
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();

    // Try to save without required fields
    await page.click('button:has-text("Save"), button:has-text("Create")');

    // Check for validation errors
    await expect(
      page.locator(".error, .alert-error, text=required").or(page.getByText(/required/i)),
    ).toBeVisible({
      timeout: 5000,
    });

    // Fill required information
    await page.fill('input[name="name"]', "Valid Collection");

    // Add at least one field
    await page.click('button:has-text("Add Field")');
    await page
      .getByRole("button", { name: /TextInput|Input/i })
      .first()
      .click();
    await page.getByPlaceholder(/label/i).fill("Test Field");
    await page.getByRole("button", { name: /save/i }).first().click();

    // Now save should work
    await page.click('button:has-text("Save Collection"), button:has-text("Create")');

    // Verify success
    await expect(page.locator("text=Success, text=Created")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should support field reordering", async ({ page }) => {
    // Navigate to existing collection or create one
    await page.goto("/config/collectionbuilder");

    // Look for existing collection or create one
    const existingCollection = page.locator('.collection-item, a[href*="edit"]').first();
    if (await existingCollection.isVisible()) {
      await existingCollection.click();
    } else {
      // Create a new collection with multiple fields
      await page.getByTestId("add-collection-button").first().click();
      await page.fill('input[name="name"]', "Reorder Test");

      // Add multiple fields
      for (let i = 0; i < 3; i++) {
        await page.click('button:has-text("Add Field")');
        await page
          .getByRole("button", { name: /TextInput|Input/i })
          .first()
          .click();
        await page.fill('input[name="label"]', `Field ${i + 1}`);
        await page.click('button:has-text("Save")');
      }
    }

    // Look for drag handles or reorder buttons
    const dragHandles = page.locator('[data-testid="drag-handle"], .drag-handle, .reorder-btn');
    if ((await dragHandles.count()) > 1) {
      // Test reordering functionality exists
      await expect(dragHandles.first()).toBeVisible();
    }
  });
});
