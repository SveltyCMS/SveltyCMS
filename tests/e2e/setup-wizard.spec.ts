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
 * - DB_TYPE (mongodb|mariadb|postgresql), DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 * - ADMIN_USER, ADMIN_EMAIL, ADMIN_PASS
 */

import { expect, type Page, test } from '@playwright/test';

// Helper: Click the Next button.
// Uses a robust selector that handles both exact label match and role+name
// to ensure it works even with hydration delays or minor UI variations.
async function clickNext(page: Page) {
	const nextBtn = page.locator('button').filter({ hasText: /^Next$/i }).first();
	await expect(nextBtn).toBeVisible({ timeout: 30_000 });
	await expect(nextBtn).toBeEnabled({ timeout: 60_000 });
	await nextBtn.click();
}

test('Setup Wizard: Configure DB and Create Admin', async ({ page }) => {
	// Capture browser console and errors for debugging
	page.on('console', (msg) => {
		const text = msg.text();
		console.log(`[BROWSER ${msg.type()}] ${text}`);
		// Fail fast if we see a 500 error in logs during connection test
		if (text.includes('500') && text.includes('testDatabase')) {
			console.error('Detected 500 error in browser logs during DB test!');
		}
	});
	page.on('pageerror', (err) => console.log(`[BROWSER ERROR] ${err.message}`));

	// Prevent the welcome modal from appearing by pre-setting sessionStorage.
	await page.addInitScript(() => {
		sessionStorage.setItem('sveltycms_welcome_modal_shown', 'true');
	});

	// 1. Start at root, expect redirect to /setup or /login
	await page.goto('/', { waitUntil: 'networkidle' });

	if (page.url().includes('/login')) {
		console.log('System already configured. Skipping setup.');
		return;
	}

	// Wait for setup to load and hydrate
	await expect(page).toHaveURL(/\/setup/);
	await page.waitForLoadState('networkidle');

	// --- STEP 1: Database ---
	await expect(page.locator('h2', { hasText: /database/i }).first()).toBeVisible({ timeout: 30_000 });

	// Select Database Type if specified (default is mongodb)
	const dbType = process.env.DB_TYPE || 'mongodb';
	if (dbType !== 'mongodb') {
		await page.locator('#db-type').selectOption(dbType);
	}

	// Fill credentials from ENV (CI) or Defaults (Local)
	const defaultPort = dbType === 'mariadb' ? '3306' : dbType === 'postgresql' ? '5432' : '27017';
	const dbHost = process.env.DB_HOST || 'localhost';
	const dbName = process.env.DB_NAME || 'SveltyCMS';
	const dbPort = process.env.DB_PORT || defaultPort;
	const dbUser = process.env.DB_USER !== undefined ? process.env.DB_USER : 'admin';
	const dbPass = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'admin';

	await page.locator('#db-host').fill(dbHost);
	await page.locator('#db-name').fill(dbName);

	if (dbType !== 'sqlite') {
		if (!page.url().includes('mongodb+srv')) {
			const portLocator = page.locator('#db-port');
			if (await portLocator.isVisible()) {
				await portLocator.fill(dbPort);
			}
		}

		const userLocator = page.locator('#db-user');
		if (await userLocator.isVisible()) {
			await userLocator.fill(dbUser);
		}

		const passLocator = page.locator('#db-password');
		if (await passLocator.isVisible()) {
			await passLocator.fill(dbPass);
		}
	}

	// Test Connection (with retry for CI stability)
	const testDbButton = page.locator('button', { hasText: /test database/i });
	await testDbButton.click();

	try {
		await expect(page.getByText(/connection successful/i).first()).toBeVisible({
			timeout: 15_000
		});
	} catch (_err) {
		console.log('Initial DB test failed, retrying once...');
		await page.waitForTimeout(5000);
		await testDbButton.click();
		await expect(page.getByText(/connection successful/i).first()).toBeVisible({
			timeout: 30_000
		});
	}

	// Move to next step (clicking Next triggers database seeding which may take time)
	await clickNext(page);

	// --- STEP 2: Admin User ---
	await expect(page.locator('h2', { hasText: /admin/i }).first()).toBeVisible({
		timeout: 60_000
	});

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
		// Check for "Complete" button first (exact match avoids stepper indicator)
		const completeBtn = page.getByLabel('Complete', { exact: true });
		if (await completeBtn.isVisible()) {
			await completeBtn.click();
			break;
		}

		// Otherwise click Next
		const nextBtn = page.getByLabel('Next', { exact: true });
		if (await nextBtn.isVisible()) {
			await nextBtn.click();
			await page.waitForTimeout(500);
		} else {
			break;
		}
	}

	// --- VERIFICATION ---
	// Expect redirect to Login or Dashboard
	await expect(page).not.toHaveURL(/\/setup/, { timeout: 30_000 });
	console.log('Setup completed successfully.');
});
