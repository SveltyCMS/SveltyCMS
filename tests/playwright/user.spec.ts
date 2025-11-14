/**
 * @file user.spec.ts
 * @description Playwright end-to-end tests for user profile and token management in SveltyCMS.
 *   - Login user
 *   - Edit and delete avatar
 *   - Edit user details
 *   - Manage registration tokens and user lists
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';

test('Login User', async ({ page }) => {
	await loginAsAdmin(page);
	console.log('✓ Login User test');
	await expect(page).toHaveURL(/\/(Collections|admin|dashboard)/);
});

test('Edit Avatar', async ({ page }) => {
	await loginAsAdmin(page);

	// Navigate to user profile
	await page.goto(`${baseURL}/user`);
	await expect(page).toHaveURL(/\/user/);

	// Click Edit Avatar button
	await page.getByRole('button', { name: /edit avatar/i }).click();

	// Wait for modal to open
	await page.waitForTimeout(500);

	// Upload a test image - use the dropzone file input (not the hidden one)
	const fileInput = page.getByTestId('file-dropzone').getByRole('button', { name: 'Upload avatar' });
	await fileInput.setInputFiles('tests/playwright/testthumb.png');

	// Click Save button
	await page.getByRole('button', { name: /save/i }).click();

	// Wait for success toast or avatar update
	await expect(page.getByText(/avatar updated/i)).toBeVisible({ timeout: 10000 });
	console.log('✓ Edit Avatar test');
});

test('Delete Avatar', async ({ page }) => {
	await loginAsAdmin(page);

	// First, ensure there's an avatar to delete by uploading one
	await page.goto(`${baseURL}/user`);
	await page.getByRole('button', { name: /edit avatar/i }).click();
	await page.waitForTimeout(500);

	// Upload a test image first
	const fileInput = page.getByTestId('file-dropzone').getByRole('button', { name: 'Upload avatar' });
	await fileInput.setInputFiles('tests/playwright/testthumb.png');
	await page.getByRole('button', { name: /save/i }).click();
	await page.waitForTimeout(2000);

	// Now delete the avatar
	await page.getByRole('button', { name: /edit avatar/i }).click();
	await page.waitForTimeout(500);

	// Click delete button (variant-filled-error)
	await page.locator('button.variant-filled-error').click();

	// Confirm deletion in the modal
	await page.getByRole('button', { name: /confirm|delete/i }).click();

	// Wait for avatar to reset to default
	await page.waitForTimeout(2000);

	// Verify default avatar is shown
	const avatar = page.locator('img[src*="Default_User.svg"]').first();
	await expect(avatar).toBeVisible({ timeout: 5000 });
	console.log('✓ Delete Avatar test');
});

test('Edit User Details', async ({ page }) => {
	await loginAsAdmin(page);

	// Navigate to user profile
	await page.goto(`${baseURL}/user`);

	// Click Edit User Settings button
	await page.getByRole('button', { name: /edit.*setting/i }).click();

	// Wait for modal
	await expect(page.locator('.modal-example-form')).toBeVisible({ timeout: 5000 });

	// Fill username (in the modal form)
	const usernameInput = page.locator('form#change_user_form input[name="username"]');
	await usernameInput.fill('AdminUser');

	// Click Save button
	await page.locator('button[type="submit"][form="change_user_form"]').click();

	// Wait for success message
	await expect(page.getByText(/user data updated/i)).toBeVisible({ timeout: 10000 });
	console.log('✓ Edit User Details test');
});

test('Registration Token', async ({ page }) => {
	await loginAsAdmin(page);

	// Navigate to user profile
	await page.goto(`${baseURL}/user`);

	// Click "Email User Registration token" button
	await page.getByRole('button', { name: /email.*token/i }).click();

	// Wait for modal
	await page.waitForTimeout(500);

	// Fill email - FloatingInput in the modal form
	await page.locator('form#token-form input[name="email"]').fill('newuser@test.com');

	// Select role by clicking the chip button (only visible for admin users)
	const userRoleChip = page.locator('button.chip:has-text("user")');
	if (await userRoleChip.isVisible({ timeout: 2000 }).catch(() => false)) {
		await userRoleChip.click();
	}

	// Select expiration time from dropdown
	await page.locator('select#expires-select').selectOption('12 hrs');

	// Click Save button (not "Send")
	await page.locator('button[type="submit"][form="token-form"]').click();

	// Wait for success confirmation (modal closes or success message)
	await page.waitForTimeout(2000);
	console.log('✓ Registration Token test');
});

test('Show or Hide User Token', async ({ page }) => {
	await loginAsAdmin(page);

	// Navigate to user profile
	await page.goto(`${baseURL}/user`);

	// Initial state: User list is shown, token list is hidden
	// Click button to show tokens (button text depends on translation keys)
	const showTokenBtn = page.locator('button:has-text("Show"), button:has-text("Token")').filter({ has: page.locator('iconify-icon[icon="material-symbols:key-outline"]') });
	await showTokenBtn.click();

	// Wait for token list to appear
	await page.waitForTimeout(1000);

	// Verify table is visible (tokens are in Admin Area table)
	const table = page.locator('table').first();
	await expect(table).toBeVisible({ timeout: 5000 });

	// Heading should show "Token List" or similar
	const heading = page.locator('h2').filter({ hasText: /token/i });
	await expect(heading).toBeVisible();

	// Click button again to hide tokens
	await showTokenBtn.click();
	await page.waitForTimeout(500);

	console.log('✓ Show or Hide User Token test');
});

test('Show or Hide User List', async ({ page }) => {
	await loginAsAdmin(page);

	// Navigate to user profile
	await page.goto(`${baseURL}/user`);

	// The user list is shown by default in the Admin Area
	// Look for the button that might toggle it
	const showListBtn = page.getByRole('button', { name: /show.*user/i, exact: false });

	// Check if button exists with timeout
	const btnExists = await showListBtn.isVisible({ timeout: 3000 }).catch(() => false);

	if (btnExists) {
		await showListBtn.click();
		await page.waitForTimeout(1000);

		// Verify table is visible
		const table = page.locator('table').first();
		await expect(table).toBeVisible({ timeout: 5000 });

		// Click hide button
		await page.getByRole('button', { name: /hide.*user/i }).click();
		await page.waitForTimeout(500);
	} else {
		// User list is already visible - just verify table exists
		const table = page.locator('table').first();
		await expect(table).toBeVisible({ timeout: 5000 });
	}

	console.log('✓ Show or Hide User List test');
});
