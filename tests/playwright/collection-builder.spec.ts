// tests/playwright/collection-builder.spec.ts
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Collection Builder with Modern Widgets', () => {
	test.beforeEach(async ({ page }) => {
		// Login as admin first
		await loginAsAdmin(page);
	});

	test('should navigate to collection builder', async ({ page }) => {
		// Navigate to collection builder
		await page.goto('/config/collectionbuilder');

		// Check if the page loads correctly
		await expect(page.locator('h1')).toContainText('Collection Builder');

		// Check if "Add Collection" button is visible
		const addCollectionButton = page.locator('button[aria-label="Add New Collection"]');
		await expect(addCollectionButton).toBeVisible({ timeout: 10000 });
		console.log('✓ Add Collection button is visible');
	});

	test('should display widget management page', async ({ page }) => {
		// Navigate to widget management
		await page.goto('/config/widgetManagement');

		await expect(page.locator('h1')).toContainText('Widget Management');

		// Check if widgets are loaded
		await page.waitForSelector('[data-testid="widget-list"], .widget-grid, .widget-dashboard', {
			timeout: 5000
		});

		// Verify core widgets are visible
		await expect(page.locator('text=TextInput, text=Checkbox, text=Input')).toBeVisible({
			timeout: 10000
		});
	});

	test('should create a collection with modern widgets', async ({ page }) => {
		// Navigate to collection builder
		await page.goto('/config/collectionbuilder');

		// Start creating a new collection
		await page.click('button:has-text("Create"), button:has-text("New"), a[href*="create"]');

		// Fill collection basic info
		await page.fill('input[name="name"], input[placeholder*="name"], input[placeholder*="Name"]', 'Test Article');
		await page.fill('input[name="description"], textarea[name="description"], input[placeholder*="description"]', 'Test collection for articles');

		// Navigate to fields/widgets tab
		const widgetTab = page.locator('button:has-text("Fields"), button:has-text("Widgets"), .tab-widgets');
		if (await widgetTab.isVisible()) {
			await widgetTab.click();
		}

		// Add a text field
		await page.click('button:has-text("Add Field"), button:has-text("Add Widget"), .add-field-btn');

		// Select a widget from the modal
		const widgetModal = page.locator('.modal, [data-testid="widget-select-modal"]');
		await widgetModal.waitFor({ state: 'visible' });

		// Select text/input widget
		await page.click('text=TextInput, text=Input, text=Text, .widget-option:has-text("Text")');
		await page.click('button:has-text("Select"), button:has-text("Choose")');

		// Configure the field
		await page.fill('input[name="label"], input[placeholder*="label"]', 'Article Title');
		await page.fill('input[name="db_fieldName"], input[placeholder*="field"], input[placeholder*="name"]', 'title');
		await page.check('input[name="required"], input[type="checkbox"]:near(text="Required")');

		// Save the field
		await page.click('button:has-text("Save"), button:has-text("Add")');

		// Verify field was added
		await expect(page.locator('text=Article Title')).toBeVisible();
	});

	test('should filter widgets by search', async ({ page }) => {
		// Navigate to collection builder and start creating
		await page.goto('/config/collectionbuilder');
		await page.click('button:has-text("Create"), button:has-text("New")');

		// Navigate to widgets and add field
		await page.click('button:has-text("Add Field"), button:has-text("Add Widget")');

		// Use search functionality
		const searchInput = page.locator('input[placeholder*="search"], input[type="search"], .search-input');
		if (await searchInput.isVisible()) {
			await searchInput.fill('text');

			// Verify search results
			await expect(page.locator('.widget-option')).toContainText('Text');

			// Clear search
			await searchInput.fill('');
		}
	});

	test('should configure widget-specific properties', async ({ page }) => {
		// Navigate to collection builder
		await page.goto('/config/collectionbuilder');
		await page.click('button:has-text("Create"), button:has-text("New")');

		// Add a field
		await page.click('button:has-text("Add Field"), button:has-text("Add Widget")');

		// Select input widget
		await page.click('text=TextInput, text=Input, .widget-option:first');
		await page.click('button:has-text("Select"), button:has-text("Choose")');

		// Configure specific properties
		await page.fill('input[name="label"]', 'User Email');
		await page.fill('input[name="db_fieldName"]', 'email');
		await page.fill('input[name="placeholder"]', 'Enter your email');
		await page.fill('input[name="maxlength"]', '100');

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
		await expect(page.locator('text=User Email')).toBeVisible();
	});

	test('should handle widget dependencies', async ({ page }) => {
		// Navigate to widget management
		await page.goto('/config/widgetManagement');

		// Check if dependency information is shown
		const widgetItems = page.locator('.widget-item, .widget-card');
		const firstWidget = widgetItems.first();

		if (await firstWidget.isVisible()) {
			// Look for dependency information
			await expect(firstWidget.locator('text=Dependencies, text=Requires')).toBeVisible({
				timeout: 5000
			});
		}
	});

	test('should enable/disable widgets', async ({ page }) => {
		// Navigate to widget management
		await page.goto('/config/widgetManagement');

		// Find a custom widget toggle
		const toggles = page.locator('input[type="checkbox"], button:has-text("Enable"), button:has-text("Disable")');
		const firstToggle = toggles.first();

		if (await firstToggle.isVisible()) {
			const isChecked = await firstToggle.isChecked();

			// Toggle the widget
			await firstToggle.click();

			// Wait for state change
			await page.waitForTimeout(1000);

			// Verify state changed
			const newState = await firstToggle.isChecked();
			expect(newState).toBe(!isChecked);
		}
	});

	test('should validate collection creation', async ({ page }) => {
		// Navigate to collection builder
		await page.goto('/config/collectionbuilder');
		await page.click('button:has-text("Create"), button:has-text("New")');

		// Try to save without required fields
		await page.click('button:has-text("Save"), button:has-text("Create")');

		// Check for validation errors
		await expect(page.locator('.error, .alert-error, text=required')).toBeVisible({
			timeout: 5000
		});

		// Fill required information
		await page.fill('input[name="name"]', 'Valid Collection');

		// Add at least one field
		await page.click('button:has-text("Add Field")');
		await page.click('.widget-option:first');
		await page.click('button:has-text("Select")');
		await page.fill('input[name="label"]', 'Test Field');
		await page.click('button:has-text("Save")');

		// Now save should work
		await page.click('button:has-text("Save Collection"), button:has-text("Create")');

		// Verify success
		await expect(page.locator('text=Success, text=Created')).toBeVisible({
			timeout: 10000
		});
	});

	test('should support field reordering', async ({ page }) => {
		// Navigate to existing collection or create one
		await page.goto('/config/collectionbuilder');

		// Look for existing collection or create one
		const existingCollection = page.locator('.collection-item:first, a[href*="edit"]:first');
		if (await existingCollection.isVisible()) {
			await existingCollection.click();
		} else {
			// Create a new collection with multiple fields
			await page.click('button:has-text("Create")');
			await page.fill('input[name="name"]', 'Reorder Test');

			// Add multiple fields
			for (let i = 0; i < 3; i++) {
				await page.click('button:has-text("Add Field")');
				await page.click('.widget-option:first');
				await page.click('button:has-text("Select")');
				await page.fill('input[name="label"]', `Field ${i + 1}`);
				await page.click('button:has-text("Save")');
			}
		}

		// Look for drag handles or reorder buttons
		const dragHandles = page.locator('.drag-handle, .reorder-btn, [data-testid="drag-handle"]');
		if ((await dragHandles.count()) > 1) {
			// Test reordering functionality exists
			await expect(dragHandles.first()).toBeVisible();
		}
	});
});
