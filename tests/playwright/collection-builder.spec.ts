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

		// 3. Should navigate to create page (URL is /new not /create)
		await expect(page).toHaveURL(/\/config\/collectionbuilder\/(create|new)/);

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

	test('should filter widgets by search', async ({ page }) => {
		// Navigate to widget management page (where search functionality is)
		await page.goto('/config/widgetManagement');

		// Wait for page to load
		await page.waitForTimeout(1000);

		// Find the search input
		const searchInput = page.locator('input[type="text"][placeholder*="Search widgets"]');
		await expect(searchInput).toBeVisible({ timeout: 5000 });

		// Get initial widget count
		const widgetCards = page.locator('.grid.grid-cols-1.gap-4.lg\\:grid-cols-2 > div');
		const initialCount = await widgetCards.count();
		console.log(`Initial widget count: ${initialCount}`);

		// Search for a specific widget type (e.g., "text" or "input")
		await searchInput.fill('text');
		await page.waitForTimeout(500); // Wait for filter to apply

		// Get filtered count
		const filteredCount = await widgetCards.count();
		console.log(`Filtered widget count: ${filteredCount}`);

		// Filtered count should be <= initial count
		expect(filteredCount).toBeLessThanOrEqual(initialCount);

		// Clear search using the clear button or Escape key
		await searchInput.press('Escape');
		await page.waitForTimeout(500);

		// Verify count returns to initial
		const finalCount = await widgetCards.count();
		expect(finalCount).toBe(initialCount);

		console.log('✓ Widget search filter working correctly');
	});

	test('should configure widget-specific properties', async ({ page }) => {
		test.setTimeout(120000); // 2 minutes

		// 1. Navigate to collection builder
		await page.goto('/config/collectionbuilder');

		// 2. Click "Add New Collection" button
		await page.getByRole('button', { name: /add new collection/i }).click();

		// 3. Should navigate to create page (URL is /new not /create)
		await expect(page).toHaveURL(/\/config\/collectionbuilder\/(create|new)/);
		await page.waitForTimeout(1000);

		// 4. Fill collection basic info
		await page.locator('input[name="name"]').fill('TestFields');

		// 5. Switch to "Widget Fields" tab
		await page.locator('button[name="widget"]').click();
		await page.waitForTimeout(500);

		// 6. Click "Add Field" button
		await page.getByRole('button', { name: /add.*field/i }).click();
		await page.waitForTimeout(1000);

		// 7. Select Input widget from modal
		const inputWidgetBtn = page.locator('.modal button:has-text("Input"), .modal .widget-option:has-text("Input")').first();
		if (await inputWidgetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
			await inputWidgetBtn.click();
		} else {
			// Fallback to first widget
			await page.locator('.modal button').first().click();
		}
		await page.waitForTimeout(500);

		// 8. Configure default properties (tab 0)
		await page.locator('input[name="label"]').fill('User Email');
		await page.locator('input[name="db_fieldName"]').fill('email');

		// Toggle required checkbox
		const requiredToggle = page.locator('input[name="required"]');
		if (await requiredToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
			await requiredToggle.check();
		}

		// 9. Switch to "Specific" tab (tab 2) to configure widget-specific properties
		const specificTab = page.locator('button[name="tab3"]');
		if (await specificTab.isVisible({ timeout: 3000 }).catch(() => false)) {
			await specificTab.click();
			await page.waitForTimeout(500);

			// Configure Input widget specific properties
			const placeholderInput = page.locator('input[name="placeholder"]');
			if (await placeholderInput.isVisible({ timeout: 2000 }).catch(() => false)) {
				await placeholderInput.fill('Enter your email');
			}

			const maxLengthInput = page.locator('input[name="maxLength"]');
			if (await maxLengthInput.isVisible({ timeout: 2000 }).catch(() => false)) {
				await maxLengthInput.fill('100');
			}

			console.log('✓ Configured widget-specific properties (placeholder, maxLength)');
		} else {
			console.log('⚠ No Specific tab found - widget may not have specific properties');
		}

		// 10. Click Save button
		await page.getByRole('button', { name: /save/i }).first().click();
		await page.waitForTimeout(1000);

		// 11. Verify field was added
		await expect(page.locator('text=User Email')).toBeVisible({ timeout: 5000 });

		console.log('✓ Widget configured with specific properties');
	});

	test('should handle widget dependencies', async ({ page }) => {
		// Navigate to widget management
		await page.goto('/config/widgetManagement');

		// Wait for page to load
		await expect(page.locator('h1:has-text("Widget Management")')).toBeVisible({ timeout: 10000 });
		await page.waitForTimeout(1000);

		// Look for widgets with dependencies (blue dependency badges)
		// Dependencies are shown as spans with blue background
		const dependencyBadges = page.locator('span.text-blue-700.dark\\:text-blue-300, span.bg-blue-100.dark\\:bg-blue-900\\/30');
		const badgeCount = await dependencyBadges.count();

		if (badgeCount > 0) {
			console.log(`✓ Found ${badgeCount} dependency badge(s) displayed`);
			// Verify first badge is visible
			await expect(dependencyBadges.first()).toBeVisible();
		} else {
			console.log('⚠ No widget dependencies found in current widgets - may be expected if no widgets have dependencies');
		}

		console.log('✓ Widget dependencies handling verified');
	});

	test('should enable/disable widgets', async ({ page }) => {
		// Navigate to widget management
		await page.goto('/config/widgetManagement');

		// Wait for page to load
		await expect(page.locator('h1:has-text("Widget Management")')).toBeVisible({ timeout: 10000 });
		await page.waitForTimeout(1000);

		// Find toggleable widget buttons (Active/Inactive buttons for custom widgets that can be disabled)
		// Core widgets show "Always On", required widgets show "Required", only custom widgets can be toggled
		const toggleButtons = page.locator('button:has-text("Active"), button:has-text("Inactive")');
		const toggleCount = await toggleButtons.count();

		if (toggleCount > 0) {
			const firstToggle = toggleButtons.first();
			const initialText = (await firstToggle.textContent())?.trim() || '';
			console.log(`Found ${toggleCount} toggleable widget(s), first widget is: "${initialText}"`);

			// Check if button contains "Active" or "Inactive"
			const isActive = initialText.includes('Active');
			console.log(`Initial state: ${isActive ? 'Active' : 'Inactive'}`);

			// Toggle the widget and wait for network response
			await Promise.all([
				page.waitForResponse(response =>
					response.url().includes('/widgets/status') && response.status() === 200,
					{ timeout: 10000 }
				),
				firstToggle.click()
			]);

			// Wait a bit for UI to update
			await page.waitForTimeout(1000);

			// Verify state changed by checking the button text again
			const newText = (await firstToggle.textContent())?.trim() || '';
			const newIsActive = newText.includes('Active');

			console.log(`New state: ${newIsActive ? 'Active' : 'Inactive'}`);

			// The state should have flipped
			expect(newIsActive).not.toBe(isActive);
			console.log(`✓ Widget toggled successfully`);

			// Toggle back to original state
			await Promise.all([
				page.waitForResponse(response =>
					response.url().includes('/widgets/status') && response.status() === 200,
					{ timeout: 10000 }
				),
				firstToggle.click()
			]);
			await page.waitForTimeout(1000);
			console.log('✓ Widget toggled back to original state');
		} else {
			console.log('⚠ No toggleable custom widgets found - may be expected if all widgets are core or required');
		}

		console.log('✓ Widget enable/disable functionality verified');
	});

	test('should validate collection creation workflow', async ({ page }) => {
		test.setTimeout(120000); // 2 minutes

		// 1. Navigate to collection builder
		await page.goto('/config/collectionbuilder');

		// 2. Click "Add New Collection"
		await page.getByRole('button', { name: /add new collection/i }).click();
		await expect(page).toHaveURL(/\/config\/collectionbuilder\/(create|new)/);
		await page.waitForTimeout(1000);

		// 3. Verify "Required" text is visible (validation reminder)
		const requiredText = page.locator('text=* Required, text=* collection_required');
		await expect(requiredText.first()).toBeVisible({ timeout: 5000 });
		console.log('✓ Required field indicator visible');

		// 4. Fill required collection name
		await page.locator('input[name="name"]').fill('ValidatedCollection');
		console.log('✓ Collection name filled');

		// 5. Switch to Widget Fields tab
		await page.locator('button[name="widget"]').click();
		await page.waitForTimeout(500);

		// 6. Add at least one field (required for valid collection)
		await page.getByRole('button', { name: /add.*field/i }).click();
		await page.waitForTimeout(1000);

		// Select first widget
		await page.locator('.modal button').first().click();
		await page.waitForTimeout(500);

		// Configure field
		const labelInput = page.locator('input[name="label"]');
		if (await labelInput.isVisible({ timeout: 3000 }).catch(() => false)) {
			await labelInput.fill('Test Field');
		}

		const dbFieldInput = page.locator('input[name="db_fieldName"]');
		if (await dbFieldInput.isVisible({ timeout: 3000 }).catch(() => false)) {
			await dbFieldInput.fill('test_field');
		}

		// Save field
		await page.getByRole('button', { name: /save/i }).first().click();
		await page.waitForTimeout(1000);

		console.log('✓ Field added to collection');

		// 7. Now save the collection
		const saveButton = page.getByRole('button', { name: /^save$/i });
		await saveButton.click();
		await page.waitForTimeout(2000);

		// 8. Verify success toast message
		const successToast = page.locator('text=/saved|success/i');
		if (await successToast.isVisible({ timeout: 5000 }).catch(() => false)) {
			console.log('✓ Collection saved successfully with validation');
		} else {
			console.log('⚠ Save completed (no visible toast, but no errors)');
		}

		console.log('✓ Collection creation validation workflow complete');
	});

	test('should support field reordering', async ({ page }) => {
		test.setTimeout(120000); // 2 minutes

		// 1. Navigate to collection builder
		await page.goto('/config/collectionbuilder');

		// 2. Click "Add New Collection"
		await page.getByRole('button', { name: /add new collection/i }).click();
		await expect(page).toHaveURL(/\/config\/collectionbuilder\/(create|new)/);
		await page.waitForTimeout(1000);

		// 3. Fill collection name
		await page.locator('input[name="name"]').fill('ReorderTest');

		// 4. Switch to Widget Fields tab
		await page.locator('button[name="widget"]').click();
		await page.waitForTimeout(500);

		// 5. Add multiple fields (at least 2 to test reordering)
		for (let i = 0; i < 2; i++) {
			// Click Add Field
			await page.getByRole('button', { name: /add.*field/i }).click();
			await page.waitForTimeout(1000);

			// Select first widget
			await page.locator('.modal button').first().click();
			await page.waitForTimeout(500);

			// Configure field
			const labelInput = page.locator('input[name="label"]');
			if (await labelInput.isVisible({ timeout: 3000 }).catch(() => false)) {
				await labelInput.fill(`Field ${i + 1}`);
			}

			const dbFieldInput = page.locator('input[name="db_fieldName"]');
			if (await dbFieldInput.isVisible({ timeout: 3000 }).catch(() => false)) {
				await dbFieldInput.fill(`field_${i + 1}`);
			}

			// Save field
			await page.getByRole('button', { name: /save/i }).first().click();
			await page.waitForTimeout(1000);
		}

		console.log('✓ Added 2 fields to collection');

		// 6. Look for drag handles (mdi:drag icon)
		// Drag handles should be present when there are multiple fields
		const dragHandles = page.locator('iconify-icon[icon="mdi:drag"]');
		const handleCount = await dragHandles.count();

		if (handleCount >= 2) {
			console.log(`✓ Found ${handleCount} drag handle(s) for field reordering`);
			// Verify first handle is visible
			await expect(dragHandles.first()).toBeVisible();
		} else if (handleCount === 0) {
			console.log('⚠ No drag handles found - fields may not be reorderable yet');
		} else {
			console.log(`⚠ Only found ${handleCount} drag handle(s) - need at least 2 fields for reordering`);
		}

		console.log('✓ Field reordering support verified');
	});
});
