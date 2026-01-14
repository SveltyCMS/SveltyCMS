/**
 * @file tests/playwright/role-based-access.spec.ts
 * @description Role-based access test for all user roles (admin, editor, viewer)
 * This test only runs in CI mode where extended users are seeded.
 * In local mode, it is skipped since only admin user is available.
 */

import { test, expect } from '@playwright/test';

// Detect CI mode
const IS_CI = process.env.CI === 'true';

// Test credentials matching seed-test-db.ts
const testUsers = {
	admin: {
		email: 'admin@example.com',
		password: 'Admin123!'
	},
	editor: {
		email: 'editor@example.com',
		password: 'Editor123!'
	},
	viewer: {
		email: 'viewer@example.com',
		password: 'Viewer123!'
	}
};

// Skip this test in local mode (extended users only available in CI)
test.skip(!IS_CI, 'Skipping role-based access tests - extended users only available in CI');

test.describe('Role-Based Access Tests (CI Only)', () => {
	test('Admin user can login and logout', async ({ page }) => {
		console.log('🔐 Testing admin user login...');
		
		// Navigate to login page
		await page.goto('/login', { waitUntil: 'networkidle' });
		
		// Check if we need to click "SIGN IN" button first
		const signInButton = page.locator('div[role="button"]:has-text("SIGN IN"), p:has-text("Sign In")').first();
		if (await signInButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await signInButton.click();
			await page.waitForTimeout(500);
		}
		
		// Fill login form
		await page.getByTestId('signin-email').fill(testUsers.admin.email);
		await page.getByTestId('signin-password').fill(testUsers.admin.password);
		await page.getByTestId('signin-submit').click();
		
		// Wait for redirect after successful login
		await expect(page).toHaveURL(/\/(Collections|admin|dashboard)/, { timeout: 10000 });
		console.log('✅ Admin login successful');
		
		// Logout
		const logoutButton = page.locator('button[aria-label="Sign Out"]').first();
		await expect(logoutButton).toBeVisible({ timeout: 10000 });
		await logoutButton.click();
		
		// Assert redirect back to login
		await expect(page).toHaveURL(/\/(login|signup)/, { timeout: 5000 });
		console.log('✅ Admin logout successful');
	});

	test('Editor user can login and logout', async ({ page }) => {
		console.log('🔐 Testing editor user login...');
		
		// Navigate to login page
		await page.goto('/login', { waitUntil: 'networkidle' });
		
		// Check if we need to click "SIGN IN" button first
		const signInButton = page.locator('div[role="button"]:has-text("SIGN IN"), p:has-text("Sign In")').first();
		if (await signInButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await signInButton.click();
			await page.waitForTimeout(500);
		}
		
		// Fill login form
		await page.getByTestId('signin-email').fill(testUsers.editor.email);
		await page.getByTestId('signin-password').fill(testUsers.editor.password);
		await page.getByTestId('signin-submit').click();
		
		// Wait for redirect after successful login
		await expect(page).toHaveURL(/\/(Collections|admin|dashboard)/, { timeout: 10000 });
		console.log('✅ Editor login successful');
		
		// Logout
		const logoutButton = page.locator('button[aria-label="Sign Out"]').first();
		await expect(logoutButton).toBeVisible({ timeout: 10000 });
		await logoutButton.click();
		
		// Assert redirect back to login
		await expect(page).toHaveURL(/\/(login|signup)/, { timeout: 5000 });
		console.log('✅ Editor logout successful');
	});

	test('Viewer user can login and logout', async ({ page }) => {
		console.log('🔐 Testing viewer user login...');
		
		// Navigate to login page
		await page.goto('/login', { waitUntil: 'networkidle' });
		
		// Check if we need to click "SIGN IN" button first
		const signInButton = page.locator('div[role="button"]:has-text("SIGN IN"), p:has-text("Sign In")').first();
		if (await signInButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await signInButton.click();
			await page.waitForTimeout(500);
		}
		
		// Fill login form
		await page.getByTestId('signin-email').fill(testUsers.viewer.email);
		await page.getByTestId('signin-password').fill(testUsers.viewer.password);
		await page.getByTestId('signin-submit').click();
		
		// Wait for redirect after successful login
		await expect(page).toHaveURL(/\/(Collections|admin|dashboard)/, { timeout: 10000 });
		console.log('✅ Viewer login successful');
		
		// Logout
		const logoutButton = page.locator('button[aria-label="Sign Out"]').first();
		await expect(logoutButton).toBeVisible({ timeout: 10000 });
		await logoutButton.click();
		
		// Assert redirect back to login
		await expect(page).toHaveURL(/\/(login|signup)/, { timeout: 5000 });
		console.log('✅ Viewer logout successful');
	});
});
