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

	test('Login and change system language between EN and DE', async ({ page }) => {
		// 1. Login
		await loginAsAdmin(page, /\/admin|\/en\/Collections\/Names/);

		// 2. Find language selector using data-testid
		const languageSelector = page.getByTestId('language-selector');
		await expect(languageSelector).toBeVisible({ timeout: 10000 });

		// 3. Loop through available language options (en, de)
		const languages = ['en', 'de'];

		for (const lang of languages) {
			// Select language from dropdown
			await languageSelector.selectOption(lang);

			// Wait briefly for UI to update
			await page.waitForTimeout(1000);

			// Verify the selector value changed
			const selectedValue = await languageSelector.inputValue();
			expect(selectedValue).toBe(lang);
			console.log(`✓ Language selector set to: ${lang.toUpperCase()}`);
		}
	});
});
