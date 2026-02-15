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

	test('Login, create collection, perform actions, and add widget', async ({ page }) => {
		// 1. Login
		await loginAsAdmin(page, /\/admin|\/en\/Collections\/Names/);

		// 2. Create Collection
		await page.getByRole('button', { name: /create/i }).click();
		await page.getByPlaceholder(/enter first name/i).fill('First Name');
		await page.getByPlaceholder(/enter last name/i).fill('Last Name');
		await page.getByRole('button', { name: /save/i }).click();
		await expect(page).toHaveURL('http://localhost:5173/en/Collections/Names');

		// 3. Perform Collection Actions
		const actions = ['Published', 'Unpublished', 'Scheduled', 'Cloned', 'Delete', 'Testing'];

		for (const action of actions) {
			// Click action button (e.g., Published)
			await page.getByRole('button', { name: new RegExp(`^${action}$`, 'i') }).click();

			// Select first collection checkbox
			const checkbox = page.locator('input[type="checkbox"]').first();
			await expect(checkbox).toBeVisible({ timeout: 5000 });
			await checkbox.check();

			// Click Save
			await page.getByRole('button', { name: /save/i }).click();

			// Confirm redirect to collection list
			await expect(page).toHaveURL('http://localhost:5173/en/Collections/Names');
		}

		// 4. Add a Widget to Dashboard
		await page.getByRole('button', { name: /system configuration/i }).click();
		await page.getByRole('link', { name: /dashboard/i }).click();
		await page.getByRole('button', { name: /add widget/i }).click();

		await page.getByPlaceholder(/search widgets/i).fill('CPU Usage');
		const cpuWidget = page.getByText(/cpu usage/i, { exact: true });
		await expect(cpuWidget).toBeVisible({ timeout: 10000 });
		await cpuWidget.click();

		// Final redirect check to dashboard
		await expect(page).toHaveURL('http://localhost:5173/dashboard', { timeout: 15000 });
	});
});
