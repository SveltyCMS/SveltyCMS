/**
 * @file tests/playwright/setup-wizard.spec.ts
 * @description Setup wizard test for SveltyCMS
 *
 * This test completes the initial setup wizard by:
 * 1. Configuring database connection
 * 2. Creating the admin user account
 * 3. Initializing system defaults
 */

import { expect, test, type Page } from '@playwright/test';

// Helper to click "Next" button and wait for transition
async function clickNext(page: Page) {
	const nextButton = page.getByLabel('Next', { exact: true });
	await expect(nextButton).toBeEnabled();
	await nextButton.click();
	await page.waitForTimeout(500); // Wait for stepper animation
}

test('Setup Wizard: Configure DB and Create Admin', async ({ page }) => {
	// Enable TEST_MODE for the browser context if possible
	// Note: The server must already be started with TEST_MODE=true

	// 1. Start at root, expect redirect to /setup or /login
	await page.goto('/', { waitUntil: 'load' });

	if (page.url().includes('/login')) {
		console.log('System already configured. Skipping setup.');
		return;
	}

	// Wait for setup to load and hydrate
	await expect(page).toHaveURL(/\/setup/);
	await page.waitForLoadState('domcontentloaded');

	// Wait for any cookie consent and accept it to prevent it blocking other elements
	const acceptAll = page.getByRole('button', { name: /accept all/i });
	if (await acceptAll.isVisible()) {
		await acceptAll.click();
	}

	// --- STEP 1: Database ---
	await expect(page.locator('h2', { hasText: /database/i }).first()).toBeVisible({ timeout: 30_000 });

	// Select Database Type if specified (default is sqlite for tests)
	const dbType = process.env.DB_TYPE || 'sqlite';
	if (dbType !== 'mongodb') {
		await page.locator('#db-type').selectOption(dbType);
	}

	// Fill credentials from ENV (CI) or Defaults (Local)
	const defaultPort = dbType === 'mariadb' ? '3306' : dbType === 'postgresql' ? '5432' : '27017';
	const dbHost = process.env.DB_HOST || 'localhost';
	const dbName = process.env.DB_NAME || 'sveltycms_test';
	const dbPort = process.env.DB_PORT || defaultPort;
	const dbUser = process.env.DB_USER !== undefined ? process.env.DB_USER : dbType === 'sqlite' ? '' : 'test';
	const dbPass = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : dbType === 'sqlite' ? '' : 'test';

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
	await testDbButton.click({ force: true });

	try {
		await expect(page.getByText(/connection successful/i).first()).toBeVisible({
			timeout: 40_000
		});
	} catch (_err) {
		console.log('Initial DB test failed, retrying once...');
		await page.waitForTimeout(5000);
		await testDbButton.click({ force: true });
		await expect(page.getByText(/connection successful/i).first()).toBeVisible({
			timeout: 60_000
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
