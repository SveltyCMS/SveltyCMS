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
	await expect(page.getByText(/Database connected successfully/i)).toBeVisible({ timeout: 20000 });

	// Click "Next" to proceed to Admin step
	await page.getByRole('button', { name: /next/i }).click();
	await page.waitForTimeout(1000);

	// --- Step 2: Admin User Creation ---
	// Wait for Admin heading to be visible
	await expect(page.getByRole('heading', { name: /admin/i }).first()).toBeVisible({ timeout: 10000 });

	// Fill admin form fields
	await page.locator('#admin-username').fill(process.env.ADMIN_USER || 'admin');
	await page.locator('#admin-email').fill(process.env.ADMIN_EMAIL || 'admin@example.com');
	await page.locator('#admin-password').fill(process.env.ADMIN_PASS || 'Admin123!');
	await page.locator('#admin-confirm-password').fill(process.env.ADMIN_PASS || 'Admin123!');

	// Click "Next" to proceed to next step
	await page.getByRole('button', { name: /next/i }).click();
	await page.waitForTimeout(2000);

	// --- Remaining steps (System, Email, Review) - click Next until Complete ---
	// Steps 3 & 4: System Config and Email Config - just click Next to accept defaults
	let maxAttempts = 5;
	while (maxAttempts > 0 && page.url().includes('/setup')) {
		maxAttempts--;

		// Check for "Complete" button (final step)
		const completeButton = page.getByRole('button', { name: /^complete$/i });
		if (await completeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			console.log('Found Complete button, finishing setup...');
			await completeButton.click();
			await page.waitForTimeout(3000);
			break;
		}

		// Otherwise look for "Next" button
		const nextButton = page.getByRole('button', { name: /next/i }).first();
		if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			console.log('Clicking Next button...');
			await nextButton.click();
			await page.waitForTimeout(2000);
		} else {
			console.log('No Next/Complete button found, assuming done...');
			break;
		}
	}

	// Try to catch the success toast (optional - it appears briefly before redirect)
	const successToast = page.getByText(/Setup complete/i);
	if (await successToast.isVisible({ timeout: 2000 }).catch(() => false)) {
		console.log('Setup complete toast appeared');
	}

	// Wait for redirect away from setup (URL object has .pathname property)
	await page.waitForURL(url => !url.pathname.includes('/setup'), { timeout: 30000 });
	console.log('Setup wizard complete, redirected to:', page.url());
});
