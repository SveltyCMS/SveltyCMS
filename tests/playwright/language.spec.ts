/**
 * @file tests/playwright/language.spec.ts
 * @description Playwright end-to-end test for changing the system language in SveltyCMS.
 *   - Logs in as admin
 *   - Iterates through language options (EN, FR, DE, ES)
 *   - Selects each language from the dropdown and waits for UI update
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('System Language Change', () => {
	test.setTimeout(60000); // 1 min

	test('Login and change system language to EN, FR, DE, ES', async ({ page }) => {
		// 1. Login
		await loginAsAdmin(page, /\/admin|\/en\/Collections\/Names/);

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
