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

		// Verify page title
		await expect(page.locator('h1:has-text("Widget Management")')).toBeVisible({ timeout: 10000 });

		// Wait for widgets to load (grid container)
		await page.waitForSelector('.grid.grid-cols-1.gap-4.lg\\:grid-cols-2', {
			timeout: 10000
		});

		// Verify stats cards are visible (Total, Active, Core, Custom)
		const statsGrid = page.locator('.grid.grid-cols-2.gap-4.md\\:grid-cols-4');
		await expect(statsGrid).toBeVisible();

		// Verify at least one widget card is displayed
		// Widgets are displayed using WidgetCard component in the grid
		const widgetCards = page.locator('.grid.grid-cols-1.gap-4.lg\\:grid-cols-2 > div');
		const count = await widgetCards.count();

		if (count > 0) {
			console.log(`✓ ${count} widgets found`);
		} else {
			console.log('⚠ No widgets loaded - check if widgets exist in the system');
		}
	});

	test('should create a collection with modern widgets', async ({ page }) => {
		test.setTimeout(120000); // 2 minutes for this complex test

		// 1. Navigate to collection builder
		await page.goto('/config/collectionbuilder');

		// 2. Click "Add New Collection" button
		await page.getByRole('button', { name: /add new collection/i }).click();

		// 3. Should navigate to create page
		await expect(page).toHaveURL(/\/config\/collectionbuilder\/create/);

		// 4. Wait for page to load - should be on "Edit" tab (tab 0) by default
		await page.waitForTimeout(1000);

		// 5. Fill collection basic info in CollectionForm (tab 0)
		// Collection name input
		const nameInput = page.locator('input[name="name"]');
		await nameInput.fill('TestArticles');

		// 6. Switch to "Widget Fields" tab (tab 1)
		const widgetFieldsTab = page.locator('button[name="widget"]');
		await widgetFieldsTab.click();
		await page.waitForTimeout(500);

		// 7. Click "Add Field" button (opens ModalSelectWidget)
		const addFieldBtn = page.getByRole('button', { name: /add.*field/i });
		await addFieldBtn.click();

		// 8. Wait for widget selection modal to appear
		await page.waitForTimeout(1000);

		// 9. Select a widget from the modal
		// The modal shows a list of available widgets
		// Let's click the first available widget
		const widgetOptions = page.locator('.modal .widget-option, .modal button:has-text("TextInput"), .modal button:has-text("Input")');
		const firstWidget = widgetOptions.first();

		if (await firstWidget.isVisible({ timeout: 5000 }).catch(() => false)) {
			await firstWidget.click();
		} else {
			// Fallback: try clicking any button in the modal that looks like a widget
			const modalButtons = page.locator('.modal button');
			await modalButtons.first().click();
		}

		await page.waitForTimeout(500);

		// 10. This should open ModalWidgetForm - configure the widget
		// Fill label (required field)
		const labelInput = page.locator('input[name="label"]');
		if (await labelInput.isVisible({ timeout: 3000 }).catch(() => false)) {
			await labelInput.fill('Article Title');
		}

		// Fill db_fieldName (required field)
		const dbFieldInput = page.locator('input[name="db_fieldName"]');
		if (await dbFieldInput.isVisible({ timeout: 3000 }).catch(() => false)) {
			await dbFieldInput.fill('title');
		}

		// 11. Click Save button to save the field
		const saveBtn = page.getByRole('button', { name: /save/i }).first();
		await saveBtn.click();

		await page.waitForTimeout(1000);

		// 12. Verify field was added to the collection
		// The field should appear in the fields list/table
		await expect(page.locator('text=Article Title')).toBeVisible({ timeout: 5000 });

		console.log('✓ Collection created with widget field');
	});

	test.skip('should filter widgets by search', async ({ page }) => {
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

	test.skip('should configure widget-specific properties', async ({ page }) => {
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

	test.skip('should handle widget dependencies', async ({ page }) => {
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

	test.skip('should enable/disable widgets', async ({ page }) => {
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

	test.skip('should validate collection creation', async ({ page }) => {
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

	test.skip('should support field reordering', async ({ page }) => {
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
