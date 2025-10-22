/**
 * @file tests/playwright/login.spec.ts
 * @description Playwright end-to-end test for the login and logout flow in SveltyCMS.
 *   - Navigates to the login page
 *   - Performs login with admin credentials
 *   - Verifies successful navigation to the admin area
 *   - Logs out and checks redirect to login page
 */
import { test, expect } from '@playwright/test';

test('Login and logout flow', async ({ page }) => {
	// Set a higher timeout for this test (optional)
	test.setTimeout(120000); // 60 seconds

	// Go to login page
	await page.goto('http://localhost:5173/login');
	await page.waitForLoadState('networkidle'); // or 'domcontentloaded'
	// Wait for login form or button to show up
	await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible({ timeout: 30000 });

	// Click "Sign In" to open the login modal (if applicable)
	await page
		.getByRole('button', { name: /sign in/i })
		.first()
		.click();

	// Fill login form fields
	await page.fill('input[name="email"]', 'admin@example.com');
	await page.fill('input[name="password"]', 'admin@123');

	// Submit the form
	await page.click('button:has-text("Sign In")');

	// Assert navigation to /admin
	await expect(page).toHaveURL(/\/en\/Collections\/Names$/, { timeout: 10000 });

	// Wait for logout button and click it
	await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30000 });

	// Click it
	await page.locator('button[aria-label="Sign Out"]').click();

	// Assert redirect back to login
	await expect(page).toHaveURL('http://localhost:5173/login');
});
