/**
 * @file tests/playwright/language.spec.ts
 * @description Playwright end-to-end test for changing the system language in SveltyCMS.
 *   - Logs in as admin
 *   - Iterates through language options (EN, FR, DE, ES)
 *   - Selects each language from the dropdown and waits for UI update
 */
import { test, expect } from '@playwright/test';

test.describe('System Language Change', () => {
	test.setTimeout(60000); // 1 min

	test('Login and change system language to EN, FR, DE, ES', async ({ page }) => {
		// 1. Login
		await page.goto('http://localhost:5173/login');
		await page
			.getByRole('button', { name: /sign in/i })
			.first()
			.click();
		await page.fill('input[name="email"]', 'admin@example.com');
		await page.fill('input[name="password"]', 'admin@123');
		await page.click('button:has-text("Sign In")');

		// 2. Wait for redirect
		await expect(page).toHaveURL(/\/admin|\/en\/Collections\/Names/);

		// 3. Loop through language options
		const languages = ['en', 'fr', 'de', 'es'];

		for (const lang of languages) {
			// Select language from dropdown
			await page.selectOption('select', lang);

			// Optional: wait briefly if UI updates after change
			await page.waitForTimeout(1000);
		}
	});
});
