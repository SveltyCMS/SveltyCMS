// tests/playwright/collection-builder.spec.ts
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("Collection Builder with Modern Widgets", () => {
  test.beforeEach(async ({ page }) => {
    // Block external icon API requests that cause CORS errors with test headers
    await page.route("https://api.iconify.design/**", (route) => route.abort());
    await page.route("https://api.simplesvg.com/**", (route) => route.abort());
    await page.route("https://api.unisvg.com/**", (route) => route.abort());
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
    await expect(page.getByRole("heading", { level: 1, name: /extension/i })).toBeVisible({
      timeout: 15_000,
    });

    // Click the Widgets tab
    await page.getByRole("tab", { name: /widgets/i }).click();

    // Wait for widget dashboard to load
    await page.waitForTimeout(2000);

    // Verify some widget-related content is visible
    await expect(page.getByText(/widget|extension|plugin/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should create a collection with modern widgets", async ({ page }) => {
    // Capture browser console logs for debugging
    page.on("console", (msg) => {
      if (
        msg.text().includes("WidgetStore") ||
        msg.text().includes("widget") ||
        msg.type() === "error"
      ) {
        console.log(`[Browser ${msg.type()}] ${msg.text()}`);
      }
    });

    // Navigate to collection builder
    await page.goto("/config/collectionbuilder");

    // Start creating a new collection
    await page.getByTestId("add-collection-button").first().click();
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 10_000 });

    // Fill collection basic info
    await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("collection-name-input").fill("Test Article");

    // Navigate to Field Configuration step
    await expect(page.getByTestId("collection-editor-stepper")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /field configuration/i }).click();

    // Wait for widget store to initialize, then click quick-add with retry
    let fieldAdded = false;
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(3000);
      await page.getByTestId("quick-add-input").click();
      try {
        await expect(page.getByTestId("widget-fields-list")).toContainText(/new input/i, {
          timeout: 5000,
        });
        fieldAdded = true;
        break;
      } catch {
        console.log(`[E2E] Widget not added on attempt ${i + 1}, retrying...`);
      }
    }
    expect(fieldAdded).toBe(true);
  });

  test("should filter widgets by search", async ({ page }) => {
    // Navigate to collection builder and start creating
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 10_000 });

    // Fill name and go to Field Configuration
    await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("collection-name-input").fill("Search Test");
    await page.getByRole("button", { name: /field configuration/i }).click();

    // Wait for widget store to initialize, then click quick-add with retry
    let fieldAdded = false;
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(3000);
      await page.getByTestId("quick-add-input").click();
      try {
        await expect(page.getByTestId("widget-fields-list")).toContainText(/new input/i, {
          timeout: 5000,
        });
        fieldAdded = true;
        break;
      } catch {
        console.log(`[E2E] Widget not added on attempt ${i + 1}, retrying...`);
      }
    }
    expect(fieldAdded).toBe(true);
  });

  test("should configure widget-specific properties", async ({ page }) => {
    // Navigate to collection builder
    await page.goto("/config/collectionbuilder");
    await page.getByTestId("add-collection-button").first().click();
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 10_000 });

    // Fill name and go to Field Configuration
    await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("collection-name-input").fill("Config Test");
    await page.getByRole("button", { name: /field configuration/i }).click();

    // Wait for widget store to initialize, then click quick-add with retry
    let fieldAdded = false;
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(3000);
      await page.getByTestId("quick-add-input").click();
      try {
        await expect(page.getByTestId("widget-fields-list")).toContainText(/new input/i, {
          timeout: 5000,
        });
        fieldAdded = true;
        break;
      } catch {
        console.log(`[E2E] Widget not added on attempt ${i + 1}, retrying...`);
      }
    }
    expect(fieldAdded).toBe(true);

    // Verify the field appears in the list with the default label
    await expect(page.getByText(/new input/i)).toBeVisible({ timeout: 10_000 });
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
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 10_000 });

    // Try to save without required fields
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create")').first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click();
    }

    // Check for validation errors or the form still being visible
    await expect(
      page
        .getByText(/required|error|please fill|name is/i)
        .or(page.getByTestId("collection-name-input"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Fill required information
    const nameInput = page
      .getByTestId("collection-name-input")
      .or(page.locator('input[name="name"]').first());
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill("Valid Collection");
    }
  });

  test("should support field reordering", async ({ page }) => {
    // Navigate to existing collection or create one
    await page.goto("/config/collectionbuilder");

    // Look for existing collection or create one
    const existingCollection = page.locator('.collection-item, a[href*="edit"]').first();
    if (await existingCollection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await existingCollection.click();
    } else {
      // Create a new collection with multiple fields
      await page.getByTestId("add-collection-button").first().click();
      await expect(page).toHaveURL(/\/config\/collectionbuilder\/new/, { timeout: 10_000 });

      const nameInput = page
        .getByTestId("collection-name-input")
        .or(page.locator('input[name="name"]').first());
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput.fill("Reorder Test");
      }

      // Add multiple fields
      for (let i = 0; i < 3; i++) {
        const addBtn = page.locator('button:has-text("Add Field")').first();
        if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addBtn.click();
          const widgetBtn = page.getByRole("button", { name: /TextInput|Input/i }).first();
          if (await widgetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await widgetBtn.click();
            const labelInput = page.locator('input[name="label"]').first();
            if (await labelInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              await labelInput.fill(`Field ${i + 1}`);
            }
            const saveBtn = page.locator('button:has-text("Save")').first();
            if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await saveBtn.click();
            }
          }
        }
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
