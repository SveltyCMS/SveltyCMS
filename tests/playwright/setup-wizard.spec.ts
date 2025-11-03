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
	await expect(page.getByRole('heading', { name: 'Database Configuration' })).toBeVisible({ timeout: 15000 });

	// --- Step 1: Database Configuration ---
	// Fill out the form using environment variables
	// Note: We use || 'default' for safety, but these *must* be set in the CI env.
	await page.getByLabel(/Host/).fill(process.env.MONGO_HOST || 'localhost');
	await page.getByLabel(/Port/).fill(process.env.MONGO_PORT || '27017');
	await page.getByLabel(/Database Name/).fill(process.env.MONGO_DB || 'SveltyCMS');
	await page.getByLabel(/User/).fill(process.env.MONGO_USER || 'admin');
	await page.getByLabel(/Password/).fill(process.env.MONGO_PASS || 'admin');

	// Click "Test Connection" and wait for success
	await page.getByRole('button', { name: 'Test Connection' }).click();
	await expect(page.getByText('Connection successful!')).toBeVisible({ timeout: 20000 });

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
