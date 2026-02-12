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

// Helper: Click and wait for navigation or next step
async function clickNext(page: Page) {
	const nextBtn = page.getByRole('button', { name: /next/i }).first();
	await expect(nextBtn).toBeVisible();
	await nextBtn.click();
}

test('Setup Wizard: Configure DB and Create Admin', async ({ page }) => {
	// 1. Start at root, expect redirect to /setup or /login
	await page.goto('/', { waitUntil: 'domcontentloaded' });

	if (page.url().includes('/login')) {
		console.log('System already configured. Skipping setup.');
		test.skip();
		return;
	}

	// Wait for setup to load
	await expect(page).toHaveURL(/\/setup/);

	// Dismiss welcome modal if it exists (using a smarter polling check)
	const getStarted = page.getByRole('button', { name: /get started/i });
	try {
		await expect(getStarted).toBeVisible({ timeout: 5000 });
		await getStarted.click();
	} catch (_e) {
		console.log('Welcome modal not visible or already dismissed');
	}

	// --- STEP 1: Database ---
	// Wait longer for the heading as things might be initializing
	await expect(page.getByRole('heading', { name: /database/i }).first()).toBeVisible({ timeout: 15000 });

	// Select Database Type if specified (default is mongodb)
	const dbType = process.env.DB_TYPE || 'mongodb';
	if (dbType !== 'mongodb') {
		await page.locator('#db-type').selectOption(dbType);
	}

	// Fill credentials from ENV (CI) or Defaults (Local)
	await page.locator('#db-host').fill(process.env.MONGO_HOST || 'localhost');
	await page.locator('#db-port').fill(process.env.MONGO_PORT || '27017');
	await page.locator('#db-name').fill(process.env.MONGO_DB || 'SveltyCMS');
	await page.locator('#db-user').fill(process.env.MONGO_USER || 'admin');
	await page.locator('#db-password').fill(process.env.MONGO_PASS || 'admin');

	// Test Connection
	await page.getByRole('button', { name: /test database/i }).click();
	await expect(page.getByText(/connected successfully/i)).toBeVisible({ timeout: 15000 });

	// Move to next step
	await clickNext(page);

	// --- STEP 2: Admin User ---
	await expect(page.getByRole('heading', { name: /admin/i }).first()).toBeVisible();

	// Fill admin user details
	await page.locator('#admin-username').fill(process.env.ADMIN_USER || 'admin');
	await page.locator('#admin-email').fill(process.env.ADMIN_EMAIL || 'admin@example.com');
	await page.locator('#admin-password').fill(process.env.ADMIN_PASS || 'Admin123!');
	await page.locator('#admin-confirm-password').fill(process.env.ADMIN_PASS || 'Admin123!');

	await clickNext(page);

	// --- STEPS 3-5: Defaults ---
	// Loop through remaining steps until "Complete" appears
	// This handles variable number of steps (Site settings, Email, etc.)
	for (let i = 0; i < 5; i++) {
		// Check for "Complete" button first
		const completeBtn = page.getByRole('button', { name: /^complete$/i });
		if (await completeBtn.isVisible()) {
			await completeBtn.click();
			break;
		}

		// Otherwise click Next
		const nextBtn = page.getByRole('button', { name: /next/i }).first();
		if (await nextBtn.isVisible()) {
			await nextBtn.click();
			// Wait for animation/transition
			await page.waitForTimeout(500);
		} else {
			break; // No buttons found, maybe we are done?
		}
	}

	// --- VERIFICATION ---
	// Expect redirect to Login or Dashboard
	await expect(page).not.toHaveURL(/\/setup/, { timeout: 30000 });
	console.log('Setup completed successfully.');
});
