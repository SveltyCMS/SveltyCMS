/**
 * @file tests/playwright/helpers/auth.ts
 * @description Shared authentication helper for Playwright tests
 * Uses the same credentials as setup-wizard to ensure consistency
 */

import { type Page } from '@playwright/test';

/**
 * Login credentials that match the setup wizard defaults
 */
export const ADMIN_CREDENTIALS = {
	email: process.env.ADMIN_EMAIL || 'admin@example.com',
	password: process.env.ADMIN_PASS || 'Admin123!'
};

/**
 * Login as admin user
 * @param page - Playwright page object
 * @param waitForUrl - URL pattern to wait for after login (default: Collections/Names page)
 */
export async function loginAsAdmin(page: Page, waitForUrl: string | RegExp = /\/(Collections|admin|dashboard)/) {
	// First, try to logout if already logged in
	await logout(page);

	// Navigate to login page
	await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });

	// Check if we got redirected to setup (config incomplete)
	if (page.url().includes('/setup')) {
		throw new Error(`Setup is not complete. Cannot login - redirected to: ${page.url()}`);
	}

	// Check if we're on the login selection page (SIGN IN / SIGN UP buttons)
	const signInButton = page.locator('div[role="button"]:has-text("SIGN IN"), p:has-text("Sign In")').first();
	if (await signInButton.isVisible({ timeout: 3000 }).catch(() => false)) {
		console.log('[Auth] Clicking SIGN IN button...');
		await signInButton.click();
		await page.waitForTimeout(1000);
	}

	// Wait for login form to be visible - use data-testid
	await page.waitForSelector('[data-testid="signin-email"]', { timeout: 15000, state: 'visible' });

	// Fill login form using data-testid selectors
	await page.getByTestId('signin-email').fill(ADMIN_CREDENTIALS.email);
	await page.getByTestId('signin-password').fill(ADMIN_CREDENTIALS.password);

	// Submit form using data-testid
	await page.getByTestId('signin-submit').click();

	// Wait for redirect after successful login
	await page.waitForURL(waitForUrl, { timeout: 15000 });
}

/**
 * Logout current user
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
	try {
		// Try to navigate to home/dashboard first to check if logged in
		await page.goto('/', { timeout: 10000, waitUntil: 'domcontentloaded' });

		// If we're on setup or login page, we're not logged in
		if (page.url().includes('/setup') || page.url().includes('/login')) {
			console.log('[Auth] Not logged in, skipping logout');
			return;
		}

		// Look for logout button or menu - try multiple selectors
		const logoutSelectors = [
			'button:has-text("Logout")',
			'button:has-text("Sign out")',
			'button:has-text("Log out")',
			'a:has-text("Logout")',
			'a:has-text("Sign out")',
			'[aria-label*="logout" i]',
			'[aria-label*="sign out" i]'
		];

		for (const selector of logoutSelectors) {
			const button = page.locator(selector).first();
			if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
				console.log(`[Auth] Logging out using selector: ${selector}`);
				await button.click();
				await page.waitForURL(/\/(login|signup)/, { timeout: 5000 }).catch(() => {});
				return;
			}
		}

		console.log('[Auth] No logout button found, clearing cookies and localStorage');
		// If no logout button found, clear session manually
		await page.context().clearCookies();
		await page.evaluate(() => {
			localStorage.clear();
			sessionStorage.clear();
		});
	} catch (error) {
		console.log('[Auth] Error during logout, continuing anyway:', error);
	}
}
