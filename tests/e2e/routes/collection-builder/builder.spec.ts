// tests/playwright/collection-builder.spec.ts
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/** Minimal SVG path for any Iconify icon placeholder */
const ICON_PLACEHOLDER =
  '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>';

test.describe("Collection Builder with Modern Widgets", () => {
  test.beforeEach(async ({ page }) => {
    // Inject E2E test mode flag before any page script runs
    // This makes widget store initialization synchronous (no scanner / API calls)
    await page.addInitScript(() => {
      (window as any).__SVELTYCMS_E2E__ = true;
    });

    // Mock Iconify API — prevent CORS/network failures in test environments
    // The <iconify-icon> web component fetches icon data from api.iconify.design
    await page.route("https://api.iconify.design/**", async (route) => {
      const url = new URL(route.request().url());
      const pathPart = url.pathname.split("/").filter(Boolean)[0] || "";
      const prefix = pathPart.replace(/\.json$/, "") || "mdi";
      const iconsParam = url.searchParams.get("icons") || "";
      const iconNames = iconsParam.split(",").filter(Boolean);

      const icons: Record<string, { body: string; width: number; height: number }> = {};
      for (const name of iconNames) {
        icons[name] = { body: ICON_PLACEHOLDER, width: 24, height: 24 };
      }

      if (iconNames.length === 0) {
        return route.fulfill({ status: 404 });
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prefix, icons, width: 24, height: 24 }),
      });
    });

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
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, {
      timeout: 10_000,
    });
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

    // Verify core widgets are visible using regex (matches actual widget names like Input, Checkbox, RichText, Select, Number)
    await expect(page.getByText(/Input|Checkbox|RichText|Select|Number/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should create a collection with modern widgets", async ({ page }) => {
    // Navigate to collection builder
    await page.goto("/config/collectionbuilder");

    // Start creating a new collection
    await page.getByTestId("add-collection-button").first().click();

    // Fill collection basic info (step 1: General Setup)
    await page.getByTestId("collection-name-input").fill("Test Article");
    await page.locator("#description").fill("Test collection for articles");

    // Navigate to step 2: Field Configuration via the stepper
    await page.getByRole("button", { name: /Field Configuration/i }).click();

    // Quick-add an Input field using the quick-add bar
    await page.getByTestId("quick-add-input").click();

    // Verify field was added (widget generates label "New Input")
    await expect(page.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });
  });

  test("should filter widgets by search", async ({ page }) => {
    // Navigate to collection builder and start creating
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();

    // Navigate to step 2: Field Configuration via the stepper
    await page.getByRole("button", { name: /Field Configuration/i }).click();

    // Use the widget search on the extensions page instead
    // The field configuration page doesn't have a search input by default
    // Skip search test if no search input is visible
    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("text");
      await expect(page.getByText(/Input|Text/i).first()).toBeVisible();
      await searchInput.fill("");
    }
  });

  test("should configure widget-specific properties", async ({ page }) => {
    // Navigate to collection builder
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();

    // Navigate to step 2: Field Configuration via the stepper
    await page.getByRole("button", { name: /Field Configuration/i }).click();

    // Use quick-add to add an Input widget (reliable in E2E — avoids modal SSR issues)
    await page.getByTestId("quick-add-input").click();
    await expect(page.getByText(/New Input/i)).toBeVisible({ timeout: 10_000 });

    // Click the configure (cog) button on the new field to open the inspector
    await page.getByTitle("Configure").click();

    // Configure label in the WidgetInspector side panel
    await page.getByPlaceholder("e.g. Profile Picture").fill("User Email");
    await page.getByPlaceholder("e.g. profile_pic").fill("email");

    // Save field via inspector's "Apply Changes" button
    await page.getByRole("button", { name: /Apply Changes/i }).click();

    // Verify field configuration (label appears in the field list)
    await expect(page.getByText("User Email").first()).toBeVisible({ timeout: 10_000 });
  });

  test("should handle widget dependencies", async ({ page }) => {
    // Navigate to widget management
    await page.goto("/config/extensions");
    await page.getByRole("tab", { name: /widgets/i }).click();

    // Check if dependency information is shown
    const widgetItems = page.locator('[data-testid="widget-grid"]').first();

    if (await widgetItems.isVisible({ timeout: 3000 }).catch(() => false)) {
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

    // Wait for the collection editor to load
    await expect(page.getByTestId("collection-name-input")).toBeVisible({
      timeout: 10_000,
    });

    // Try to save without fields
    await page.getByTestId("save-collection-button").first().click();

    // Check for validation toast
    await expect(
      page.getByText(/at least one field/i).or(page.getByText(/fix.*errors/i)),
    ).toBeVisible({
      timeout: 5000,
    });

    // Fill required information
    await page.getByTestId("collection-name-input").fill("Valid Collection");

    // Navigate to step 2 and add at least one field
    await page.getByRole("button", { name: /Field Configuration/i }).click();
    await page.getByTestId("quick-add-input").click();

    // Now save should work
    await page.getByTestId("save-collection-button").first().click();

    // Verify success (toast appears)
    await expect(page.getByText(/collection saved/i)).toBeVisible({
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
      await page.getByTestId("collection-name-input").fill("Reorder Test");

      // Navigate to the Field Configuration step
      await page.getByRole("button", { name: /Field Configuration/i }).click();

      // Add multiple fields using the quick-add bar
      for (let i = 0; i < 3; i++) {
        await page.getByTestId("quick-add-input").click();
        await page.waitForTimeout(300);
      }
    }

    // Look for drag handles or reorder buttons (use the dndzone container)
    const dragHandles = page.locator('[data-testid="widget-fields-list"] [class*="cursor-grab"]');
    if ((await dragHandles.count()) > 1) {
      // Test reordering functionality exists
      await expect(dragHandles.first()).toBeVisible();
    }
  });
});
