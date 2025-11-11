/**
 * @file tests/playwright/setup-wizard.spec.ts
 * @description Setup wizard test for SveltyCMS
 *
 * This test completes the initial setup wizard by:
 * 1. Configuring database connection
 * 2. Creating the admin user account
 * 3. Accepting default system settings
 * 4. Completing the setup process
 *
 * Environment variables required (set in GitHub Actions workflow):
 * - MONGO_HOST, MONGO_PORT, MONGO_DB, MONGO_USER, MONGO_PASS
 * - ADMIN_USER, ADMIN_EMAIL, ADMIN_PASS
 */

import { test, expect, type Page } from '@playwright/test';

// Helper function to click a button and wait for it to process
async function clickAndWait(page: Page, buttonName: string | RegExp, waitMs = 2000) {
	const button = page.getByRole('button', { name: buttonName });
	await button.click();
	await page.waitForTimeout(waitMs);
}

// Helper function to dismiss the welcome modal if it appears
async function dismissWelcomeModal(page: Page) {
	const getStartedButton = page.getByRole('button', { name: /get started/i });

	if (await getStartedButton.isVisible({ timeout: 5000 }).catch(() => false)) {
		console.log('Dismissing welcome modal...');
		await getStartedButton.click();
		await page.waitForTimeout(2000);
	}
}

// Step 1: Configure database connection
async function configureDatabaseConnection(page: Page) {
	console.log('Step 1: Configuring database connection...');

	// Wait for page to be fully loaded
	await page.waitForLoadState('networkidle');
	
	// Wait for database configuration form with extended timeout
	await expect(page.getByRole('heading', { name: /database/i }).first()).toBeVisible({ timeout: 30000 });

	// Fill database configuration
	await page.locator('#db-host').fill(process.env.MONGO_HOST || 'localhost');
	await page.locator('#db-port').fill(process.env.MONGO_PORT || '27017');
	await page.locator('#db-name').fill(process.env.MONGO_DB || 'SveltyCMS');
	await page.locator('#db-user').fill(process.env.MONGO_USER || 'admin');
	await page.locator('#db-password').fill(process.env.MONGO_PASS || 'admin');

	// Test database connection
	await page.getByRole('button', { name: 'Test Database Connection' }).click();
	await expect(page.getByText(/Database connected successfully/i)).toBeVisible({ timeout: 20000 });

	console.log('✓ Database connection successful');
}

// Step 2: Create admin user account
async function createAdminUser(page: Page) {
	console.log('Step 2: Creating admin user...');

	// Wait for admin form
	await expect(page.getByRole('heading', { name: /admin/i }).first()).toBeVisible({ timeout: 10000 });

	// Fill admin user details
	await page.locator('#admin-username').fill(process.env.ADMIN_USER || 'admin');
	await page.locator('#admin-email').fill(process.env.ADMIN_EMAIL || 'admin@example.com');
	await page.locator('#admin-password').fill(process.env.ADMIN_PASS || 'Admin123!');
	await page.locator('#admin-confirm-password').fill(process.env.ADMIN_PASS || 'Admin123!');

	console.log('✓ Admin user details filled');
}

/**
 * Steps 3-5: Complete remaining setup steps (System, Email, Review)
 * Just clicks Next/Complete buttons to accept defaults
 */
async function completeRemainingSteps(page: Page) {
	console.log('Steps 3-5: Completing remaining setup steps...');

	let attempts = 0;
	const maxAttempts = 5;

	while (attempts < maxAttempts && page.url().includes('/setup')) {
		attempts++;

		// Check for "Complete" button (final step)
		const completeButton = page.getByRole('button', { name: /^complete$/i });
		if (await completeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			console.log('✓ Reached final step, completing setup...');
			await completeButton.click();
			await page.waitForTimeout(3000);
			break;
		}

		// Otherwise, click "Next" to proceed
		const nextButton = page.getByRole('button', { name: /next/i }).first();
		if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await nextButton.click();
			await page.waitForTimeout(2000);
		} else {
			console.log('No navigation button found');
			break;
		}
	}
}

// Verify setup completion
async function verifySetupComplete(page: Page) {
	console.log('Verifying setup completion...');

	// Try to catch success toast (optional - appears briefly)
	const successToast = page.getByText(/Setup complete/i);
	if (await successToast.isVisible({ timeout: 2000 }).catch(() => false)) {
		console.log('✓ Setup complete toast appeared');
	}

	// Verify redirect away from setup page
	await page.waitForURL((url) => !url.pathname.includes('/setup'), { timeout: 30000 });
	console.log('✓ Setup wizard complete, redirected to:', page.url());
}

// Main test: Complete the setup wizard
test('should complete the setup wizard and create an admin user', async ({ page }) => {
	// Navigate to application
	await page.goto('/', { waitUntil: 'networkidle' });
	await expect(page).toHaveURL(/.*\/setup/, { timeout: 30000 });

	// Dismiss welcome modal if present
	await dismissWelcomeModal(page);

	// Step 1: Configure database
	await configureDatabaseConnection(page);
	await clickAndWait(page, /next/i, 1000);

	// Step 2: Create admin user
	await createAdminUser(page);
	await clickAndWait(page, /next/i, 2000);

	// Steps 3-5: Complete remaining steps
	await completeRemainingSteps(page);

	// Verify completion
	await verifySetupComplete(page);
});
