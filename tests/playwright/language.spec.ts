/**
 * @file tests/playwright/language.spec.ts
 * @description Playwright end-to-end test for changing the system language in SveltyCMS.
 *   - Logs in as admin
 *   - Iterates through language options (EN, FR, DE, ES)
 *   - Selects each language from the dropdown and waits for UI update
 */
import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAndGetFreshPage, ensureSidebarVisible } from './helpers/auth';

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

test.describe('System Language Change', () => {
	test.setTimeout(60000); // 1 min

	test('Login and change system language between EN and DE', async ({ authPage }) => {
		const page = authPage;

		// On mobile viewports, open sidebar to access language selector
		await ensureSidebarVisible(page);

		// Find language selector using data-testid
		const languageSelector = page.getByTestId('language-selector');
		await expect(languageSelector).toBeVisible({ timeout: 10000 });

		// Loop through available language options (en, de)
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
