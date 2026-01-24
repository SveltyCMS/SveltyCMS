/**
 * @file tests/playwright/public-access.spec.ts
 * @description Tests for unauthenticated (signed-out) user access
 * 
 * This test suite ensures that:
 * - Public endpoints are accessible without authentication
 * - Protected endpoints properly redirect to login or return 401
 * - Security is properly enforced for unauthorized access
 */

import { test, expect } from '@playwright/test';

test.describe('Signed Out User Access', () => {
	test.setTimeout(30000); // 30 second timeout

	test('should redirect to login when accessing dashboard', async ({ page }) => {
		await page.goto('/dashboard');
		await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
	});

	test('should redirect to login when accessing config pages', async ({ page }) => {
		await page.goto('/config/systemsetting');
		await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
	});

	test('should redirect to login when accessing user management', async ({ page }) => {
		await page.goto('/config/user');
		await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
	});

	test('should allow access to login page', async ({ page }) => {
		await page.goto('/login');
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByTestId('signin-email')).toBeVisible();
	});

	test('should block access to protected API endpoints', async ({ page }) => {
		const response = await page.request.get('/api/user/profile');
		expect(response.status()).toBeGreaterThanOrEqual(401);
		expect(response.status()).toBeLessThan(500);
	});

	test('should block access to collections API without auth', async ({ page }) => {
		const response = await page.request.get('/api/collections');
		expect(response.status()).toBeGreaterThanOrEqual(401);
		expect(response.status()).toBeLessThan(500);
	});

	test('should allow access to health check endpoint', async ({ page }) => {
		const response = await page.request.get('/health');
		expect(response.ok() || response.status() === 404).toBeTruthy();
	});
});
