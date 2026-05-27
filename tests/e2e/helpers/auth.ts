/**
 * @file tests/e2e/helpers/auth.ts
 * @description Shared authentication helpers for Playwright E2E tests.
 *
 * All selectors use data-testid so they survive UI/theme refactors.
 * The server must be started with TEST_MODE=true so it uses config/private.test.ts.
 */

import { expect, type Page } from '@playwright/test';

export const ADMIN_CREDENTIALS = {
	email: process.env.ADMIN_EMAIL || 'admin@example.com',
	password: process.env.ADMIN_PASS || 'Admin123!'
};

/**
 * Login as admin. Waits for the redirect away from /login before returning.
 * Pass `waitForUrl` to wait for a specific URL pattern instead.
 */
export async function loginAsAdmin(page: Page, waitForUrl?: string | RegExp) {
	await loginAs(page, ADMIN_CREDENTIALS, waitForUrl);
}

/**
 * Login as any user by email/password.
 */
export async function loginAs(
	page: Page,
	credentials: { email: string; password: string },
	waitForUrl?: string | RegExp
) {
	// If already logged in, log out first
	await logout(page);

	// ?mode=signin tells the login page to open the sign-in panel immediately,
	// bypassing the click chain that depends on Svelte hydration timing.
	await page.goto('/login?mode=signin', { waitUntil: 'load', timeout: 15_000 });

	// Pre-accept cookie consent so the banner never blocks clicks in tests.
	// The consent store reads localStorage on boot; setting it before Svelte
	// hydrates prevents the 500ms-delayed banner from appearing.
	await page.evaluate(() => {
		localStorage.setItem(
			'sveltycms_consent',
			JSON.stringify({ necessary: true, analytics: false, marketing: false, responded: true })
		);
	});

	if (page.url().includes('/setup')) {
		throw new Error(`Setup is not complete. Cannot login — redirected to: ${page.url()}`);
	}

	// Wait for the form fields — the ?mode=signin param expands the panel on load.
	await page.waitForSelector('[data-testid="signin-email"]', {
		state: 'visible',
		timeout: 15_000
	});

	await page.getByTestId('signin-email').fill(credentials.email);
	await page.getByTestId('signin-password').fill(credentials.password);
	await page.getByTestId('signin-submit').click();

	if (waitForUrl) {
		await page.waitForURL(waitForUrl, { timeout: 20_000 });
	} else {
		await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
	}
}

/**
 * Log out the current session.
 * Tries data-testid first, then aria-label, then clears cookies as a last resort.
 */
export async function logout(page: Page) {
	try {
		await page.goto('/', { timeout: 15_000, waitUntil: 'domcontentloaded' });

		if (page.url().includes('/setup') || page.url().includes('/login')) {
			return; // Already logged out
		}

		// Prefer data-testid; fall back to aria-label
		const candidates = [
			page.getByTestId('signout-button'),
			page.getByTestId('logout-button'),
			page.locator('[aria-label*="sign out" i]').first(),
			page.locator('[aria-label*="logout" i]').first(),
			page.getByRole('button', { name: /^sign out$/i }).first(),
			page.getByRole('button', { name: /^log out$/i }).first()
		];

		for (const btn of candidates) {
			if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
				await btn.click();
				await page.waitForURL(/\/(login|signup)/, { timeout: 10_000 }).catch(() => {});
				break; // fall through to cookie-clear if redirect didn't happen
			}
		}

		// Ensure we're at /login — clear cookies and navigate if still authenticated
		if (!page.url().match(/\/(login|signup)/)) {
			await page.context().clearCookies();
			await page.evaluate(() => {
				localStorage.clear();
				sessionStorage.clear();
			});
			await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});
		}
	} catch {
		// Never let logout failures block test setup
	}
}

/**
 * On mobile viewports the sidebar is collapsed — open it before clicking sidebar links.
 */
export async function ensureSidebarVisible(page: Page): Promise<boolean> {
	const viewport = page.viewportSize();
	if (!viewport || viewport.width >= 768) return false;

	const menuButton = page
		.getByTestId('sidebar-toggle')
		.or(page.locator('[aria-label*="menu" i]').first())
		.or(page.locator('[aria-label*="sidebar" i]').first())
		.first();

	if (await menuButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
		await menuButton.click();
		await page.waitForTimeout(400);
		return true;
	}
	return false;
}
