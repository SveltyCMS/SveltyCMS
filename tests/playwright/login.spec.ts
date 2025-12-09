/**
 * @file tests/playwright/login.spec.ts
 * @description Playwright end-to-end test for the login and logout flow in SveltyCMS.
 *   - Navigates to the login page
 *   - Performs login with admin credentials
 *   - Verifies successful navigation to the admin area
 *   - Logs out and checks redirect to login page
 */
import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { ADMIN_CREDENTIALS, loginAndGetFreshPage, ensureSidebarVisible } from './helpers/auth';

// Extend the base test with a custom fixture that handles login properly
const test = base.extend<{ authPage: Page; authContext: BrowserContext }>({
	authPage: async ({ page }, use) => {
		const { page: freshPage, context: newContext } = await loginAndGetFreshPage(page);
		await use(freshPage);
		await newContext.close();
	},
	authContext: async ({ page }, use) => {
		const { context: newContext } = await loginAndGetFreshPage(page);
		await use(newContext);
		await newContext.close();
	}
});

test('Login and logout flow', async ({ authPage }) => {
	const page = authPage;

	// Set a higher timeout for this test (optional)
	test.setTimeout(120000); // 2 minutes

	// Assert we're logged in and at the Collections page
	await expect(page).toHaveURL(/\/(Collections|admin|dashboard|user|config)/, { timeout: 10000 });
	console.log('✓ Login successful, current URL:', page.url());

	// On mobile viewports, open sidebar to access logout button
	await ensureSidebarVisible(page);

	// Wait for logout button and click it
	const logoutButton = page.locator('button[aria-label="Sign Out"]').first();
	await expect(logoutButton).toBeVisible({ timeout: 30000 });

	// Click logout
	await logoutButton.click();

	// Assert redirect back to login
	await expect(page).toHaveURL(/\/(login|signup)/, { timeout: 10000 });
	console.log('✓ Logout successful');
});
