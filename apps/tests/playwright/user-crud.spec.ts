/**
 * @file tests/playwright/user-crud.spec.ts
 * @description Playwright end-to-end tests for user management CRUD flows in SveltyCMS.
 *   - Admin login
 *   - Read and edit user profile
 *   - Delete, block, and unblock users
 *   - Invite user via email and accept invitation
 */
import { test, expect } from '@playwright/test';

test.describe('User Management Flow', () => {
	test.setTimeout(120000); // 2 min timeout

	const adminEmail = 'admin@example.com';
	const adminPassword = 'admin@123';

	test('Admin Login', async ({ page }) => {
		await page.goto('http://localhost:5173/login');
		await page
			.getByRole('button', { name: /sign in/i })
			.first()
			.click();
		await page.fill('input[name="email"]', adminEmail);
		await page.fill('input[name="password"]', adminPassword);
		await page.click('button:has-text("Sign In")');
		await expect(page).toHaveURL(/\/admin|\/en\/Collections\/Names/);
	});

	test('Read and Edit User Profile', async ({ page }) => {
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

		// ✅ READ operation - assert user profile visible
		await expect(page.locator('h1')).toContainText(/user profile/i);

		// ✅ UPDATE operation - Edit user info
		await page.getByRole('button', { name: /edit/i }).click();
		await page.getByPlaceholder(/username/i).fill('updatedUser');
		await page.getByRole('button', { name: /save/i }).click();

		// Confirm update saved
		await expect(page.locator('text=updatedUser')).toBeVisible();
	});

	test('Delete, Block, and Unblock Users', async ({ page }) => {
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

	test('Invite User via Email and Accept Invitation', async ({ page }) => {
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
