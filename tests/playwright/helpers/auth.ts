/**
 * @file tests/playwright/helpers/auth.ts
 * @description Shared authentication helper for Playwright tests
 * Uses the same credentials as setup-wizard to ensure consistency
 */

import { type Page, type BrowserContext, type APIRequestContext } from '@playwright/test';

/**
 * Login credentials that match the setup wizard defaults
 */
export const ADMIN_CREDENTIALS = {
	email: process.env.ADMIN_EMAIL || 'admin@example.com',
	password: process.env.ADMIN_PASS || 'Admin123!'
};

/**
 * Login as admin user using UI-based form submission.
 * The form submission with native form behavior works with Playwright.
 *
 * @param page - Playwright page object
 * @param waitForUrl - URL pattern to wait for after login (default: Collections/Names page)
 */
export async function loginAsAdmin(page: Page, waitForUrl: string | RegExp = /\/(config|user|en|de|Collections|admin|dashboard)/) {
	// Get the base URL
	const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:4173';
	console.log(`[Auth] Using base URL: ${baseURL}`);

	// First, try to logout if already logged in
	await logout(page);

	// Navigate to login page
	// NOTE: Use 'domcontentloaded' instead of 'networkidle' because the app has an SSE
	// connection (/api/settings/public/stream) that keeps the network active indefinitely.
	// Using 'networkidle' would cause the test to hang forever.
	console.log('[Auth] Navigating to /login...');
	await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.waitForTimeout(500); // Give time for hydration
	console.log(`[Auth] Current URL after navigation: ${page.url()}`);

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

	// The form uses native submission (no use:enhance), so browser handles the redirect
	await Promise.all([
		// Wait for the navigation to complete - the server returns a 303 redirect
		page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }),
		// Click the submit button
		page.getByTestId('signin-submit').click()
	]);

	console.log(`[Auth] Login successful, redirected to: ${page.url()}`);

	// Wait for page to be fully loaded
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(500);

	// Final URL check
	const finalUrl = page.url();
	const waitForUrlRegex = waitForUrl instanceof RegExp ? waitForUrl : new RegExp(waitForUrl);

	if (!waitForUrlRegex.test(finalUrl)) {
		throw new Error(`Expected URL to match ${waitForUrl}, but got ${finalUrl}`);
	}

	console.log(`[Auth] URL matched: ${page.url()}`);
}

/**
 * Login and return a fresh page from a NEW browser context.
 *
 * IMPORTANT: After native form submission with window.location.href redirect,
 * the original page AND the entire browser context can become unresponsive in headless mode.
 * This function creates a completely new browser context with the session cookies
 * to avoid this issue.
 *
 * @param page - Playwright page object used for login (will become unusable after)
 * @param waitForUrl - URL pattern to wait for after login
 * @returns Object containing fresh page and new context (MUST close context after test)
 */
export async function loginAndGetFreshPage(
	page: Page,
	waitForUrl: string | RegExp = /\/(config|user|en|de|Collections|admin|dashboard)/
): Promise<{ page: Page; context: BrowserContext }> {
	// Get the browser from the page's context
	const browser = page.context().browser();
	if (!browser) {
		throw new Error('No browser available from page context');
	}

	// Perform login using the provided page
	await loginAsAdmin(page, waitForUrl);

	// Get the current URL after login
	const currentUrl = page.url();
	console.log(`[Auth] Login page URL: ${currentUrl}`);

	// Get cookies from the login context
	const cookies = await page.context().cookies();
	console.log(`[Auth] Context has ${cookies.length} cookies`);
	// Log cookie details for debugging
	for (const cookie of cookies) {
		console.log(`[Auth] Cookie: ${cookie.name} = ${cookie.value.substring(0, 20)}... (domain: ${cookie.domain}, path: ${cookie.path})`);
	}

	// Create a COMPLETELY NEW browser context with the same cookies
	// This avoids any corruption from the original context
	console.log('[Auth] Creating new browser context...');
	const newContext = await browser.newContext();
	await newContext.addCookies(cookies);

	// Create a fresh page in the new context
	console.log('[Auth] Creating fresh page in new context...');
	const freshPage = await newContext.newPage();

	// Navigate to the URL where we should be after login
	console.log(`[Auth] Navigating fresh page to: ${currentUrl}`);
	await freshPage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

	// Wait for page to be visually ready
	await freshPage.waitForLoadState('domcontentloaded');
	await freshPage.waitForTimeout(500);

	console.log(`[Auth] Fresh page ready at: ${freshPage.url()}`);

	// Return both the page and context so the test can clean up
	return { page: freshPage, context: newContext };
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
