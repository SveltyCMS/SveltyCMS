/**
 * @file tests/playwright/permission-change.spec.ts
 * @description Playwright end-to-end test for permission management in SveltyCMS.
 *   - Logs in as admin
 *   - Navigates to Access Management
 *   - Checks 2–3 permission checkboxes and saves
 *   - Asserts success via URL and confirmation message
 */
import { test, expect } from '@playwright/test';

test.describe('Permission Management Flow', () => {
	test.setTimeout(60000); // 1 min

	const adminEmail = 'admin@example.com';
	const adminPassword = 'admin@123';

	test('Login and change permissions in Access Management', async ({ page }) => {
		// 1. Login
		await page.goto('http://localhost:5173/login');
		await page
			.getByRole('button', { name: /sign in/i })
			.first()
			.click();
		await page.fill('input[name="email"]', adminEmail);
		await page.fill('input[name="password"]', adminPassword);
		await page.click('button:has-text("Sign In")');
		await expect(page).toHaveURL(/\/admin|\/en\/Collections\/Names/);

		// 2. Navigate to System Configuration
		await page.getByRole('button', { name: /system configuration/i }).click();

		// 3. Click Access Management
		await page.getByRole('link', { name: /access management/i }).click();

		// 4. Check 2–3 permission checkboxes (random or first 3)
		const checkboxes = page.locator('input[type="checkbox"]:not([disabled])');
		const count = await checkboxes.count();
		const toCheck = Math.min(count, 3);

		for (let i = 0; i < toCheck; i++) {
			await checkboxes.nth(i).check();
		}

		// 5. Click Save
		await page.getByRole('button', { name: /save/i }).click();

		// 6. Assert success — via URL or confirmation message
		// Adjust this based on your actual success behavior
		await expect(page).toHaveURL(/access-management/i);
		await expect(page.locator('text=Permissions updated')).toBeVisible({ timeout: 10000 });
	});
});
