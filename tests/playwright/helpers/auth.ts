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
	console.log('[Auth] Navigating to /login...');
	await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });
	console.log(`[Auth] Current URL after navigation: ${page.url()}`);

	// Take screenshot for debugging
	await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
	console.log('[Auth] Screenshot saved: debug-login-page.png');

	// Log page content for debugging
	const pageContent = await page.content();
	console.log(`[Auth] Page content length: ${pageContent.length} chars`);
	console.log(`[Auth] Page title: ${await page.title()}`);

	// Check if page contains actual content or just bootstrap
	const bodyText = await page.locator('body').innerText();
	console.log(`[Auth] Body text preview (first 500 chars): ${bodyText.substring(0, 500)}`);

	// Check if we got redirected to setup (config incomplete)
	if (page.url().includes('/setup')) {
		throw new Error(`Setup is not complete. Cannot login - redirected to: ${page.url()}`);
	}

	// Check if we're on the login selection page (SIGN IN / SIGN UP buttons)
	const signInButton = page.locator('div[role="button"]:has-text("SIGN IN"), p:has-text("Sign In")').first();
	const signInVisible = await signInButton.isVisible({ timeout: 5000 }).catch(() => false);
	console.log(`[Auth] SIGN IN button visible: ${signInVisible}`);

	if (signInVisible) {
		console.log('[Auth] Clicking SIGN IN button...');
		await signInButton.click();
		await page.waitForTimeout(1000);
		console.log('[Auth] Clicked SIGN IN button');
	}

	// Wait for login form to be visible - use data-testid
	console.log('[Auth] Waiting for signin-email field...');
	await page.waitForSelector('[data-testid="signin-email"]', { timeout: 15000, state: 'visible' }).catch(async (e) => {
		console.error('[Auth] ERROR: signin-email field not found!');
		console.error(`[Auth] Available inputs: ${await page.locator('input').count()}`);
		const inputs = await page.locator('input').all();
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i];
			const id = await input.getAttribute('id');
			const name = await input.getAttribute('name');
			const type = await input.getAttribute('type');
			const testId = await input.getAttribute('data-testid');
			console.error(`[Auth]   Input ${i}: id=${id}, name=${name}, type=${type}, data-testid=${testId}`);
		}
		throw e;
	});
	console.log('[Auth] Email field found');

	// Fill login form using data-testid selectors
	console.log(`[Auth] Filling email: ${ADMIN_CREDENTIALS.email}`);
	await page.getByTestId('signin-email').fill(ADMIN_CREDENTIALS.email);
	console.log(`[Auth] Filling password: ${'*'.repeat(ADMIN_CREDENTIALS.password.length)}`);
	await page.getByTestId('signin-password').fill(ADMIN_CREDENTIALS.password);

	// Submit form using data-testid
	console.log('[Auth] Submitting login form...');
	await page.getByTestId('signin-submit').click();

	// Wait for redirect after successful login
	console.log('[Auth] Waiting for redirect...');
	await page.waitForURL(waitForUrl, { timeout: 15000 });
	console.log(`[Auth] Login successful, redirected to: ${page.url()}`);
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

/**
 * Ensure sidebar is visible on mobile viewports
 * On mobile (<768px), the sidebar is hidden by default
 * @param page - Playwright page object
 */
export async function ensureSidebarVisible(page: Page) {
	const viewport = page.viewportSize();
	const isMobile = viewport && viewport.width < 768;

	if (isMobile) {
		// Try to find and click the menu/hamburger button to open sidebar
		const menuButton = page.locator('button[aria-label*="menu" i], button[aria-label*="sidebar" i], button[aria-label="Open Sidebar"]').first();
		const menuVisible = await menuButton.isVisible().catch(() => false);

		if (menuVisible) {
			await menuButton.click();
			await page.waitForTimeout(500);
			console.log('✓ Opened sidebar on mobile viewport');
			return true;
		}
	}
	return false;
}
