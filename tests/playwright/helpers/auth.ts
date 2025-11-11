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
 * @param waitForUrl - URL pattern to wait for after login (default: dashboard)
 */
export async function loginAsAdmin(page: Page, waitForUrl: string | RegExp = '**/dashboard') {
	await page.goto('/login');

	// Fill login form
	await page.fill('input[name="email"]', ADMIN_CREDENTIALS.email);
	await page.fill('input[name="password"]', ADMIN_CREDENTIALS.password);

	// Submit form
	await page.click('button[type="submit"]');

	// Wait for redirect after successful login
	await page.waitForURL(waitForUrl, { timeout: 10000 });
}

/**
 * Logout current user
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
	// Look for logout button or menu
	const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout"), button:has-text("Sign out")');

	if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
		await logoutButton.click();
		await page.waitForURL('**/login', { timeout: 5000 });
	}
}
