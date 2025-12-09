/**
 * @file tests/playwright/permission-change.spec.ts
 * @description Playwright end-to-end test for permission management in SveltyCMS.
 *   - Logs in as admin
 *   - Navigates to Access Management
 *   - Checks 2–3 permission checkboxes and saves
 *   - Asserts success via URL and confirmation message
 */
import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAndGetFreshPage } from './helpers/auth';

// Extend the base test with a custom fixture that handles login properly
const test = base.extend<{ authPage: Page; authContext: BrowserContext }>({
	authPage: async ({ page }, use) => {
		const { page: freshPage, context: newContext } = await loginAndGetFreshPage(page, /\/admin|\/en\/Collections\/Names/);
		await use(freshPage);
		await newContext.close();
	},
	authContext: async ({ page }, use) => {
		const { context: newContext } = await loginAndGetFreshPage(page, /\/admin|\/en\/Collections\/Names/);
		await use(newContext);
		await newContext.close();
	}
});

test.describe('Permission Management Flow', () => {
	test.setTimeout(60000); // 1 min

	test('Login and change permissions in Access Management', async ({ authPage }) => {
		const page = authPage;

		// Navigate to Access Management directly (it's a config page)
		await page.goto('/config/accessManagement');

		// Wait for page to load - we should be on Permissions tab by default (tab 0)
		await expect(page.locator('h1:has-text("Access Management")')).toBeVisible({ timeout: 10000 });

		// Wait for permissions table to load
		await page.waitForTimeout(1000);

		// Toggle 2-3 permission checkboxes
		// The checkboxes are in the permissions table
		const checkboxes = page.locator('table input[type="checkbox"].form-checkbox');
		const count = await checkboxes.count();

		if (count === 0) {
			console.log('⚠ No permission checkboxes found, skipping checkbox changes');
		} else {
			const toToggle = Math.min(count, 3);
			console.log(`Toggling ${toToggle} permission checkboxes...`);

			for (let i = 0; i < toToggle; i++) {
				await checkboxes.nth(i).click();
				await page.waitForTimeout(200); // Small delay between clicks
			}
		}

		// Save button should now be enabled (has modifiedChanges)
		// Wait for Save button to be enabled
		const saveButton = page.getByRole('button', { name: /save all changes/i });
		await expect(saveButton).toBeEnabled({ timeout: 5000 });

		// Click Save
		await saveButton.click();

		// Wait for success toast message
		await expect(page.getByText(/configuration updated successfully/i)).toBeVisible({ timeout: 10000 });

		console.log('✓ Permissions updated successfully');
	});
});
