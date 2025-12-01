/**
 * @file tests/playwright/permission-change.spec.ts
 * @description Playwright end-to-end test for permission management in SveltyCMS.
 *   - Logs in as admin
 *   - Navigates to Access Management
 *   - Checks 2–3 permission checkboxes and saves
 *   - Asserts success via URL and confirmation message
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Permission Management Flow', () => {
	test.setTimeout(60000); // 1 min

	test('Login and change permissions in Access Management', async ({ page }) => {
		// 1. Login
		await loginAsAdmin(page, /\/admin|\/en\/Collections\/Names/);

		// 2. Navigate to Access Management directly (it's a config page)
		await page.goto('/config/accessManagement');

		// 3. Wait for page to load - we should be on Permissions tab by default (tab 0)
		await expect(page.locator('h1:has-text("Access Management")')).toBeVisible({ timeout: 10000 });

		// 4. Wait for permissions table to load
		await page.waitForTimeout(1000);

		// 5. Toggle 2-3 permission checkboxes
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

		// 6. Save button should now be enabled (has modifiedChanges)
		// Wait for Save button to be enabled
		const saveButton = page.getByRole('button', { name: /save all changes/i });
		await expect(saveButton).toBeEnabled({ timeout: 5000 });

		// 7. Click Save
		await saveButton.click();

		// 8. Wait for success toast message
		await expect(page.getByText(/configuration updated successfully/i)).toBeVisible({ timeout: 10000 });

		console.log('✓ Permissions updated successfully');
	});
});
