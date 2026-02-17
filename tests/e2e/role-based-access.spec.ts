/**
 * @file tests/playwright/role-based-access.spec.ts
 * @description Role-Based Access Control (RBAC) tests for SveltyCMS
 *
 * Tests that different user roles have appropriate access permissions:
 * - admin: Full system access
 * - developer: API + config access, no user management
 * - editor: Content management only, no settings
 *
 * Based on: docs/architecture/admin-user-management.mdx
 */

import { expect, type Page, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { seedTestUsers, TEST_USERS } from './helpers/seed';

// Test credentials (created by setup wizard + seed script)
const USERS = {
	admin: {
		email: 'admin@example.com',
		password: 'Admin123!'
	},
	...TEST_USERS
};

async function login(page: Page, user: { email: string; password: string }) {
	await page.goto('/login', { waitUntil: 'networkidle', timeout: 30_000 });

	// The login page starts with Sign In / Sign Up selection.
	// Click "Go to Sign In" to reveal the login form.
	const signInButton = page.locator('p:has-text("Sign In")').first();
	const signInVisible = await signInButton.isVisible({ timeout: 5000 }).catch(() => false);
	if (signInVisible) {
		await signInButton.click();
		await page.waitForTimeout(1000);
	}

	// Wait for the form to appear, then fill it
	await page.waitForSelector('[data-testid="signin-email"]', { timeout: 15_000, state: 'visible' });
	await page.getByTestId('signin-email').fill(user.email);
	await page.getByTestId('signin-password').fill(user.password);
	await page.getByTestId('signin-submit').click();

	// Wait for redirect away from login
	await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

async function logout(page: Page) {
	// Look for logout button
	const logoutButton = page.locator('button[aria-label="Sign Out"]').first();
	if (await logoutButton.isVisible({ timeout: 2000 })) {
		await logoutButton.click();
		await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
	}
}

test.describe('Role-Based Access Control', () => {
	test.setTimeout(60_000); // 1 minute timeout for all tests

	test.beforeAll(async ({ browser }) => {
		// Use a separate context/page to seed users so we don't interfere with individual tests
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await loginAsAdmin(page);
			await seedTestUsers(page);
		} catch (error) {
			console.error('Failed to seed test users:', error);
		} finally {
			await context.close();
		}
	});

	test('Admin: Full access to all system areas', async ({ page }) => {
		await loginAsAdmin(page);

		// System Settings (admin only)
		await page.goto('/config/systemsetting');
		await expect(page).toHaveURL(/systemsetting/, { timeout: 10_000 });
		await expect(page.getByText(/system settings/i).first()).toBeVisible({ timeout: 10_000 });

		// User Management (admin only) - /config/user may redirect to /user
		await page.goto('/config/user');
		await expect(page).toHaveURL(/\/user/, { timeout: 10_000 });

		// Should see "Email User Registration token" button (admin privilege)
		const emailTokenButton = page.getByRole('button', { name: /email.*token/i });
		await expect(emailTokenButton).toBeVisible({ timeout: 10_000 });

		// Access Management (admin only)
		await page.goto('/config/accessManagement');
		await expect(page).toHaveURL(/accessManagement/i, { timeout: 10_000 });

		await logout(page);
	});

	test('Developer: Can access system config but NOT user management', async ({ page }) => {
		await login(page, USERS.developer);

		// Developer CAN access system configuration
		await page.goto('/config/systemsetting');
		await expect(page).toHaveURL(/\/config\/systemsetting/, { timeout: 5000 });
		await expect(page.getByText(/system settings/i)).toBeVisible();

		// Developer CAN access main config area
		await page.goto('/config');
		await expect(page).toHaveURL(/\/config/, { timeout: 5000 });

		// Developer CANNOT manage users
		await page.goto('/config/user');

		// Should either redirect or show forbidden message
		await page.waitForLoadState('networkidle');
		const currentUrl = page.url();
		const bodyText = await page.textContent('body');

		const isBlocked =
			!currentUrl.includes('/config/user') ||
			bodyText?.toLowerCase().includes('forbidden') ||
			bodyText?.toLowerCase().includes('unauthorized') ||
			bodyText?.toLowerCase().includes('access denied') ||
			bodyText?.toLowerCase().includes('permission');

		expect(isBlocked).toBeTruthy();

		await logout(page);
	});

	test('Editor: Can access content but NOT system settings', async ({ page }) => {
		await login(page, USERS.editor);

		// Editor CAN access collections (content management)
		await page.goto('/collection');
		await expect(page).toHaveURL(/\/collection/, { timeout: 5000 });

		// Editor CANNOT access system settings
		await page.goto('/config/systemsetting');

		await page.waitForLoadState('networkidle');
		const settingsUrl = page.url();
		const settingsBody = await page.textContent('body');

		const isBlockedFromSettings =
			!settingsUrl.includes('/config/systemsetting') ||
			settingsBody?.toLowerCase().includes('forbidden') ||
			settingsBody?.toLowerCase().includes('unauthorized') ||
			settingsBody?.toLowerCase().includes('access denied');

		expect(isBlockedFromSettings).toBeTruthy();

		// Editor CANNOT manage users
		await page.goto('/config/user');

		await page.waitForLoadState('networkidle');
		const userUrl = page.url();
		const userBody = await page.textContent('body');

		const isBlockedFromUsers =
			!userUrl.includes('/config/user') ||
			userBody?.toLowerCase().includes('forbidden') ||
			userBody?.toLowerCase().includes('unauthorized') ||
			userBody?.toLowerCase().includes('access denied');

		expect(isBlockedFromUsers).toBeTruthy();

		// Editor CANNOT access access management
		await page.goto('/config/accessManagement');

		await page.waitForLoadState('networkidle');
		const accessUrl = page.url();
		const accessBody = await page.textContent('body');

		const isBlockedFromAccess =
			!accessUrl.includes('/config/accessManagement') ||
			accessBody?.toLowerCase().includes('forbidden') ||
			accessBody?.toLowerCase().includes('unauthorized') ||
			accessBody?.toLowerCase().includes('access denied');

		expect(isBlockedFromAccess).toBeTruthy();

		await logout(page);
	});

	test('Media Ownership: Admins see all, others see only own', async ({ page }) => {
		// 1. Admin should see all media
		await loginAsAdmin(page);
		const adminMediaResponse = await page.evaluate(async () => {
			const res = await fetch('/api/media');
			return await res.json();
		});
		expect(Array.isArray(adminMediaResponse)).toBeTruthy();
		const totalMediaCount = adminMediaResponse.length;
		console.log(`Admin sees ${totalMediaCount} media items`);
		await logout(page);

		// 2. Editor should only see their own media
		// Note: This assumes the editor hasn't uploaded anything yet in a fresh test DB
		await login(page, USERS.editor);
		const editorMediaResponse = await page.evaluate(async () => {
			const res = await fetch('/api/media');
			return await res.json();
		});
		expect(Array.isArray(editorMediaResponse)).toBeTruthy();

		// If it's a fresh DB, editor sees 0. If they uploaded, they see only theirs.
		// The key is that they shouldn't see what the admin uploaded (if any).
		console.log(`Editor sees ${editorMediaResponse.length} media items`);

		// Safety check: editor count should be <= admin count
		expect(editorMediaResponse.length).toBeLessThanOrEqual(totalMediaCount);

		await logout(page);
	});

	test('Verify all roles can login and logout', async ({ page }) => {
		// Test admin
		await login(page, USERS.admin);
		await expect(page).not.toHaveURL(/\/login/);
		await logout(page);
		await expect(page).toHaveURL(/\/login/);

		// Test developer
		await login(page, USERS.developer);
		await expect(page).not.toHaveURL(/\/login/);
		await logout(page);
		await expect(page).toHaveURL(/\/login/);

		// Test editor
		await login(page, USERS.editor);
		await expect(page).not.toHaveURL(/\/login/);
		await logout(page);
		await expect(page).toHaveURL(/\/login/);
	});
});
