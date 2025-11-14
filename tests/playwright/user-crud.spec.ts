/**
 * @file tests/playwright/user-crud.spec.ts
 * @description Playwright end-to-end tests for user management CRUD flows in SveltyCMS.
 *   - Admin login
 *   - Read and edit user profile
 *   - Delete, block, and unblock users
 *   - Invite user via email and accept invitation
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('User Management Flow', () => {
	test.setTimeout(120000); // 2 min timeout

	test('Admin Login', async ({ page }) => {
		await loginAsAdmin(page);
		await expect(page).toHaveURL(/\/(admin|Collections)/);
		console.log('✓ Admin logged in successfully');
	});

	test('Read and Edit User Profile', async ({ page }) => {
		// Login
		await loginAsAdmin(page);

		// Navigate to User Profile via avatar button in sidebar
		await page.getByRole('button', { name: /user profile/i }).click();

		// Wait for /user page to load
		await expect(page).toHaveURL(/\/user/);

		// ✅ READ operation - assert user profile visible
		// Check for page title icon and user data fields
		await expect(page.locator('input[name="username"]')).toBeVisible();
		await expect(page.locator('input[name="email"]')).toBeVisible();
		console.log('✓ User profile page loaded with user data');

		// ✅ UPDATE operation - Edit user info
		// Click edit user settings button
		await page.getByRole('button', { name: /edit.*setting/i }).click();

		// Wait for modal to open and be visible
		await expect(page.locator('.modal-example-form')).toBeVisible({ timeout: 5000 });

		// Find and update username field in the modal (within form#change_user_form)
		const usernameInput = page.locator('form#change_user_form input[name="username"]');
		await usernameInput.fill('updatedAdmin');

		// Click Save button - it's a submit button for the form
		await page.locator('button[type="submit"][form="change_user_form"]').click();

		// Wait for success toast
		await expect(page.getByText(/user data updated/i)).toBeVisible({ timeout: 10000 });
		console.log('✓ User profile updated successfully');
	});

	// TODO: Complex test - requires creating additional users first
	// Can't delete/block the only admin user in the system
	// Skipping as it needs full user creation workflow
	test.skip('Delete, Block, and Unblock Users', async ({ page }) => {
		await loginAsAdmin(page);

		// Navigate to user profile page (Admin Area)
		await page.goto('/user');

		// This test would need to:
		// 1. First create additional test users (can't delete/block the only admin)
		// 2. Show user list (if not already visible)
		// 3. Select user checkboxes
		// 4. Use Multibutton dropdown to select action (Block/Unblock/Delete)
		// 5. Confirm in modal
		//
		// Multibutton structure:
		// - Main button shows current action (Edit/Delete/Block/Unblock)
		// - Dropdown button with aria-label="Open actions menu"
		// - ListBox with available actions
		// - Modal confirmation for destructive actions
		//
		// Requires investigation of user creation workflow first
	});

	// TODO: Complex test - requires email token extraction from response/toast
	// The token is generated server-side and would need to be extracted from API response
	// Skipping as it needs investigation of how to get the actual token
	test.skip('Invite User via Email and Accept Invitation', async ({ page }) => {
		await loginAsAdmin(page);

		// Navigate to user profile page
		await page.goto('/user');

		// Click "Email User Registration token" button
		await page.getByRole('button', { name: /email.*token/i }).click();

		// Wait for modal
		await page.waitForTimeout(500);

		// Fill email in the modal form (form#token-form)
		await page.locator('form#token-form input[name="email"]').fill('inviteduser@example.com');

		// Select role (chip button for admin users)
		const userRoleChip = page.locator('button.chip:has-text("user")');
		if (await userRoleChip.isVisible({ timeout: 2000 }).catch(() => false)) {
			await userRoleChip.click();
		}

		// Select expiration
		await page.locator('select#expires-select').selectOption('2 days');

		// Click Save button
		await page.locator('button[type="submit"][form="token-form"]').click();

		// Wait for success (modal closes)
		await page.waitForTimeout(2000);

		// This test would need to:
		// 1. Extract the generated token from API response or toast message
		// 2. Navigate to signup page with email and token as query params
		// 3. Fill signup form with username, password
		// 4. Submit and verify account creation
		//
		// The token is generated server-side and returned in the API response
		// Would need to intercept network request or extract from UI to get actual token
	});
});
