/**
 * @file tests/playwright/collection.spec.ts
 * @description Playwright end-to-end test for the full collection and widget flow in SveltyCMS.
 *   - Logs in as admin
 *   - Creates a new collection
 *   - Performs various collection actions (Published, Unpublished, etc.)
 *   - Adds a widget to the dashboard and verifies navigation
 */
import { test, expect } from '@playwright/test';

test.describe('Full Collection & Widget Flow', () => {
	test.setTimeout(120000); // 2 minutes

	test('Login, create collection, perform actions, and add widget', async ({ page }) => {
		// 1. Login
		await page.goto('http://localhost:5173/login', { timeout: 60000 });
		await page
			.getByRole('button', { name: /sign in/i })
			.first()
			.click();
		await page.fill('input[name="email"]', 'admin@example.com');
		await page.fill('input[name="password"]', 'admin@123');
		await page.click('button:has-text("Sign In")');
		await expect(page).toHaveURL(/\/admin|\/en\/Collections\/Names/, { timeout: 15000 });

		// 2. Create Collection
		await page.getByRole('button', { name: /create/i }).click();
		await page.getByPlaceholder(/enter first name/i).fill('First Name');
		await page.getByPlaceholder(/enter last name/i).fill('Last Name');
		await page.getByRole('button', { name: /save/i }).click();
		await expect(page).toHaveURL('http://localhost:5173/en/Collections/Names');
		//delete collection

		const targetRow = await page.getByRole('row', {
			name: /First Name\s+Last Name.*Unpublish/
		}).first();

		await targetRow.getByRole('checkbox').check();
		await page.getByRole('button', { name: 'Toggle dropdown' }).click();
		await page.getByRole('button', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Delete (1 item)' }).click();
		await page.getByTestId('modal').getByRole('button', { name: 'Delete' }).click();

		await page.getByRole('button', { name: 'Toggle dropdown' }).click();
		await page.getByRole('button', { name: /create/i }).click();
		await page.getByRole('button', { name: 'Create' }).click();
		await page.getByPlaceholder(/enter first name/i).fill('First Name');
		await page.getByPlaceholder(/enter last name/i).fill('Last Name');
		await page.getByRole('button', { name: /save/i }).click();
		await expect(page).toHaveURL('http://localhost:5173/en/Collections/Names');

		// ✅ Step 1: Publish
		await targetRow.getByRole('checkbox').check();
		await page.getByRole('button', { name: 'Toggle dropdown' }).click();
		await page.getByRole('button', { name: 'Publish', exact: true }).click();
		await page.getByRole('button', { name: 'Publish (1 item)' }).click();
		await page.getByTestId('modal').getByRole('button', { name: 'Publish' }).click();

		// ✅ Step 2: Unpublish
		await targetRow.getByRole('checkbox').check(); // Optional, but safe to re-check
		await page.getByRole('button', { name: 'Toggle dropdown' }).click();
		await targetRow.getByRole('checkbox').check();
		await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
		await page.getByRole('button', { name: 'Unpublish (1 item)' }).click();
		await page.getByTestId('modal').getByRole('button', { name: 'Unpublish' }).click();

		await targetRow.getByRole('checkbox').check();

		await page.getByRole('button', { name: 'Toggle dropdown' }).click();
		await page.getByRole('button', { name: 'Clone' }).click();
		await page.getByRole('button', { name: 'Clone (1 item)' }).click();
		await page.getByTestId('modal').getByRole('button', { name: 'Clone' }).nth(0).click();

		await page.getByTestId('modal').getByRole('button', { name: 'Clone' }).nth(1).click();





		await page.getByRole('button', { name: 'Toggle dropdown' }).click();
		await page.getByRole('button', { name: 'Schedule' }).click();
		await targetRow.getByRole('checkbox').check();
		await page.getByRole('button', { name: 'Schedule (1 item)' }).click();
		await page.getByRole('textbox', { name: 'Schedule Date' }).fill('2025-07-31');
		await page.getByRole('textbox', { name: 'Schedule Time' }).click();
		await page.getByRole('textbox', { name: 'Schedule Time' }).fill('20:00');
		await page.getByRole('button', { name: 'Save schedule' }).click();



		await page.getByRole('button', { name: 'Toggle dropdown' }).click();
		await page.getByRole('button', { name: 'Test' }).click();
		await targetRow.getByRole('checkbox').check();
		await page.getByRole('button', { name: 'Test (1 item)' }).click();

		await targetRow.getByRole('checkbox').check();
		await page.getByRole('button', { name: 'Toggle dropdown' }).click();
		await page.getByRole('button', { name: 'Draft' }).click();
		await page.getByRole('button', { name: 'Draft (1 item)' }).click();
		await page.getByRole('button', { name: 'Draft (1 item)' }).click();


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
