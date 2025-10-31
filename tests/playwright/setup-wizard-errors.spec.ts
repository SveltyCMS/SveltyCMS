// @file tests/playwright/setup-wizard-errors.spec.ts
// This test checks for error handling in the setup wizard.

import { test, expect } from '@playwright/test';

test('should show error on bad database connection', async ({ page }) => {
	await page.goto('/setup');
	await page.getByLabel(/Host/).fill('bad-host-name');
	await page.getByLabel(/Password/).fill('wrong-password');
	// ... fill other fields ...

	await page.getByRole('button', { name: 'Test Connection' }).click();

	// Assert that an error message appears
	await expect(page.getByText(/Connection failed/)).toBeVisible();

	// Assert that the "Next" button is NOT visible or is disabled
	await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
});
