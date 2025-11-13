/**
 * @file tests/playwright/user-crud.spec.ts
 * @description Playwright end-to-end tests for user management CRUD flows in SveltyCMS.
 *   - Admin login
 *   - Read and edit user profile
 *   - Delete, block, and unblock users
 *   - Invite user via email and accept invitation
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, ADMIN_CREDENTIALS } from './helpers/auth';

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

	// TODO: Needs rewrite with loginAsAdmin helper and current selectors
	test.skip('Delete, Block, and Unblock Users', async ({ page }) => {
		// Login
		await page.goto('http://localhost:5173/login');
		await page
			.getByRole('button', { name: /sign in/i })
			.first()
			.click();
		await page.fill('input[name="email"]', adminEmail);
		await page.fill('input[name="password"]', adminPassword);
		await page.click('button:has-text("Sign In")');

		// Go to User Profile
		await page.getByRole('link', { name: /user profile/i }).click();

		const actions = ['Delete', 'Block', 'Unblock'];

		for (const action of actions) {
			// Click dropdown button to open menu
			await page.getByRole('button', { name: /open actions menu/i }).click();

			// Select action
			await page.getByRole('menuitem', { name: new RegExp(action, 'i') }).click();

			// Click Confirm
			await page.getByRole('button', { name: /confirm/i }).click();

			// Optional: Wait for confirmation toast or success message
			await expect(page.locator('text=' + action)).toBeVisible({ timeout: 5000 });
		}
	});

	// TODO: Needs rewrite with loginAsAdmin helper and current selectors
	test.skip('Invite User via Email and Accept Invitation', async ({ page }) => {
		// Login
		await page.goto('http://localhost:5173/login');
		await page
			.getByRole('button', { name: /sign in/i })
			.first()
			.click();
		await page.fill('input[name="email"]', adminEmail);
		await page.fill('input[name="password"]', adminPassword);
		await page.click('button:has-text("Sign In")');

		// Go to User Profile
		await page.getByRole('link', { name: /user profile/i }).click();

		// Click on email user registration token
		await page.getByRole('button', { name: /email user registration token/i }).click();

		// Fill form
		await page.fill('input[name="email"]', 'newuser@example.com');
		await page.fill('input[name="username"]', 'newuser');
		await page.selectOption('select[name="role"]', 'user');
		await page.getByRole('button', { name: /save/i }).click();

		// Assume invite sent, now simulate user following invite link
		await page.goto('http://localhost:5173/signup?email=abd@gmail.com&token=5tbv_AQui_vm6StL7SSEWA69-fzwhbbtiLfGbh_8x80');

		// Check prefilled fields
		await expect(page.locator('input[name="email"]')).toHaveValue('newuser@example.com');
		await expect(page.locator('input[name="token"]')).toHaveValue('1234');

		// Fill remaining signup fields
		await page.fill('input[name="username"]', 'newuser');
		await page.fill('input[name="password"]', 'user@123');
		await page.fill('input[name="confirm_password"]', 'user@123');

		await page.getByRole('button', { name: /accept invitation and create account/i }).click();

		// Optional: Assert signup success
		await expect(page.locator('text=Account created')).toBeVisible({ timeout: 10000 });
	});
});
