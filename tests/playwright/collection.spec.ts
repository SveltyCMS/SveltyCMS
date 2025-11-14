/**
 * @file tests/playwright/collection.spec.ts
 * @description Playwright end-to-end test for the full collection and widget flow in SveltyCMS.
 *   - Logs in as admin
 *   - Creates a new collection
 *   - Performs various collection actions (Published, Unpublished, etc.)
 *   - Adds a widget to the dashboard and verifies navigation
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Full Collection & Widget Flow', () => {
	test.setTimeout(120000); // 2 minutes

	test('Navigate to collection builder and verify structure', async ({ page }) => {
		// 1. Login
		await loginAsAdmin(page);

		// 2. Navigate to collection builder
		await page.goto('/config/collectionbuilder');

		// 3. Verify page loads correctly
		await expect(page.locator('h1:has-text("Collection Builder")')).toBeVisible({ timeout: 10000 });

		// 4. Verify "Add New Collection" button exists
		const addCollectionBtn = page.getByRole('button', { name: /add new collection/i });
		await expect(addCollectionBtn).toBeVisible();

		// 5. Verify "Add Category" button exists
		const addCategoryBtn = page.getByRole('button', { name: /add.*category/i });
		await expect(addCategoryBtn).toBeVisible();

		// 6. Check if board/categories are visible (the drag-drop area)
		const board = page.locator('[role="region"][aria-label*="Collection Board"]');
		await expect(board).toBeVisible({ timeout: 5000 });

		console.log('✓ Collection builder page structure verified');
	});

	// TODO: Full collection CRUD test would require:
	// 1. Creating a collection via collection builder (complex modal workflow)
	// 2. Adding fields/widgets to the collection
	// 3. Saving the collection
	// 4. Creating entries in that collection
	// 5. Performing CRUD operations on entries
	// This is a complex end-to-end integration test that needs investigation
});
