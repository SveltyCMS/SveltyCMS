/**
 * @file tests/playwright/login.spec.ts
 * @description Playwright end-to-end test for the login and logout flow in SveltyCMS.
 *   - Navigates to the login page
 *   - Performs login with admin credentials
 *   - Verifies successful navigation to the admin area
 *   - Logs out and checks redirect to login page
 */
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to login page using baseURL from config
		const response = await page.goto('/login', { 
			waitUntil: 'domcontentloaded',
			timeout: 60000 
		});
		
		// Check if we got a successful response
		if (response && response.status() !== 200) {
			const responseText = await response.text();
			console.log(`Server Error Details: ${response.status()} - ${response.statusText()}`);
			console.log(`Response body: ${responseText}`);
			throw new Error(`Server returned ${response.status()}: ${response.statusText()}. Response: ${responseText}`);
		}
	});

	test('should login with valid credentials', async ({ page }) => {
		test.setTimeout(120000);

		await page.waitForLoadState('networkidle');
		
		// Use data-testid attributes for more reliable selectors
		const emailInput = page.locator('[data-testid="email"], input[name="email"], input[type="email"]').first();
		const passwordInput = page.locator('[data-testid="password"], input[name="password"], input[type="password"]').first();
		const loginButton = page.locator('[data-testid="login-button"], button:has-text("Sign In"), button[type="submit"]').first();

		await expect(emailInput).toBeVisible({ timeout: 30000 });

		// Fill login form fields
		await emailInput.fill(process.env.TEST_ADMIN_EMAIL || 'admin@example.com');
		await passwordInput.fill(process.env.TEST_ADMIN_PASSWORD || 'admin@123');

		// Submit the form
		await loginButton.click();

		// Assert successful login (more flexible URL matching)
		await expect(page).toHaveURL(/\/(admin|dashboard|en\/Collections)/i, { timeout: 10000 });
		
		// Verify we're logged in by checking for user menu or dashboard elements
		const userIndicator = page.locator('[data-testid="user-menu"], [aria-label="User menu"], button:has-text("Sign Out")').first();
		await expect(userIndicator).toBeVisible({ timeout: 30000 });
	});

	test('should logout successfully', async ({ page }) => {
		// First login
		await page.fill('[data-testid="email"], input[name="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@example.com');
		await page.fill('[data-testid="password"], input[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'admin@123');
		await page.click('[data-testid="login-button"], button:has-text("Sign In")');
		
		await expect(page).toHaveURL(/\/(admin|dashboard|en\/Collections)/i, { timeout: 10000 });

		// Find and click logout button
		const logoutButton = page.locator('[data-testid="logout-button"], button[aria-label="Sign Out"], button:has-text("Sign Out")').first();
		await expect(logoutButton).toBeVisible({ timeout: 30000 });
		await logoutButton.click();

		// Assert redirect back to login
		await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
		
		// Verify we're logged out
		const loginForm = page.locator('[data-testid="login-form"], form, input[name="email"]').first();
		await expect(loginForm).toBeVisible();
	});

	test('should show error for invalid credentials', async ({ page }) => {
		await page.fill('[data-testid="email"], input[name="email"]', 'invalid@example.com');
		await page.fill('[data-testid="password"], input[name="password"]', 'wrongpassword');
		await page.click('[data-testid="login-button"], button:has-text("Sign In")');

		// Should show error message
		const errorMessage = page.locator('[data-testid="error-message"], .error, [role="alert"]').first();
		await expect(errorMessage).toBeVisible({ timeout: 5000 });
		
		// Should remain on login page
		await expect(page).toHaveURL(/\/login/);
	});
});
