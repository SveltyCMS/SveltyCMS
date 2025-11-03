//@file tests/playwright/setup-wizard.spect.ts
// This test performs the setup.
// It uses the environment variables from the workflow file.

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.resolve(__dirname, '..', '..', 'setup-storage-state.json');

test('should complete the setup wizard and create an admin user', async ({ page }) => {
	// 1. Go to the site, expect redirect to /setup
	await page.goto('/', { waitUntil: 'networkidle' });
	await expect(page).toHaveURL(/.*\/setup/, { timeout: 30000 });

	// Click "Get started" button if it appears (welcome popup/modal)
	const getStartedButton = page.getByRole('button', { name: /get started/i });
	try {
		if (await getStartedButton.isVisible({ timeout: 5000 })) {
			console.log('Found "Get started" button, clicking...');
			await getStartedButton.click();
			await page.waitForTimeout(2000); // Wait for modal to close and form to appear
		}
	} catch (e) {
		console.log('No "Get started" button found, continuing...');
	}

	// Wait for the database configuration form to be visible (check for heading or form field)
	await expect(page.getByRole('heading', { name: /database/i }).first()).toBeVisible({ timeout: 15000 });

	// --- Step 1: Database Configuration ---
	// Fill out the form using environment variables
	// Note: We use || 'default' for safety, but these *must* be set in the CI env.
	await page.locator('#db-host').fill(process.env.MONGO_HOST || 'localhost');
	await page.locator('#db-port').fill(process.env.MONGO_PORT || '27017');
	await page.locator('#db-name').fill(process.env.MONGO_DB || 'SveltyCMS');
	await page.locator('#db-user').fill(process.env.MONGO_USER || 'admin');
	await page.locator('#db-password').fill(process.env.MONGO_PASS || 'admin');

	// Click "Test Database Connection" and wait for success
	await page.getByRole('button', { name: 'Test Database Connection' }).click();
	await expect(page.getByText(/connection successful/i)).toBeVisible({ timeout: 20000 });

	// Click "Next"
	await page.getByRole('button', { name: 'Next' }).click();

	// --- Step 2: System Language ---
	await expect(page.getByRole('heading', { name: 'System Language' })).toBeVisible();
	// Just click "Next" to accept defaults
	await page.getByRole('button', { name: 'Next' }).click();

	// --- Step 3: Admin User Creation ---
	await expect(page.getByRole('heading', { name: 'Create Admin User' })).toBeVisible();
	await page.getByLabel('Username').fill(process.env.ADMIN_USER || 'admin');
	await page.getByLabel('Email').fill(process.env.ADMIN_EMAIL || 'admin@example.com');
	await page.getByLabel('Password', { exact: true }).fill(process.env.ADMIN_PASS || 'Admin123!');
	await page.getByLabel('Confirm Password').fill(process.env.ADMIN_PASS || 'Admin123!');

	// Click "Complete Setup"
	await page.getByRole('button', { name: 'Complete Setup' }).click();

	// --- Step 4: Wait for Completion and Redirect ---
	// Wait for the "Setup complete" toast
	await expect(page.getByText(/Setup complete!/)).toBeVisible({ timeout: 20000 });

	// Expect redirect to the dashboard or collection builder
	await expect(page).not.toHaveURL(/.*\/setup/);
	await expect(page.getByRole('button', { name: 'admin' })).toBeVisible();

	// --- Step 5: Save the authentication state ---
	// This saves the session cookie into the authFile.
	// All other tests will automatically use this to be "logged in".
	await page.context().storageState({ path: authFile });

	console.log('Setup wizard complete, auth state saved.');
});
