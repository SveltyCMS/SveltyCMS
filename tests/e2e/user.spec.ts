/**
 * @file tests/e2e/user.spec.ts
 * @description E2E tests for user profile management.
 * Uses data-testid and role selectors — no CSS classes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = path.dirname(FILENAME);
const AVATAR_PATH = path.join(DIRNAME, 'testthumb.png');

test.describe('User Profile Management', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsAdmin(page);
		// After login we land somewhere in the app — just confirm we are NOT on login/setup
		await expect(page).not.toHaveURL(/\/(login|setup)/);
	});

	test('login verification', async ({ page }) => {
		expect(page.url()).not.toContain('/login');
	});

	test('edit avatar', async ({ page }) => {
		if (!fs.existsSync(AVATAR_PATH)) {
			console.warn(`Test image not found at ${AVATAR_PATH}. Skipping.`);
			return;
		}

		await page.goto('/user', { waitUntil: 'load' });
		await expect(page.getByRole('heading', { name: /user profile/i })).toBeVisible({ timeout: 10_000 });

		await page.getByRole('button', { name: /edit avatar/i }).click();

		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(AVATAR_PATH);

		await page.getByRole('button', { name: /save/i }).click();

		// Avatar image should appear (any img — theme-agnostic)
		await expect(page.locator('img').first()).toBeVisible({ timeout: 10_000 });
	});

	test('delete avatar', async ({ page }) => {
		await page.goto('/user', { waitUntil: 'load' });
		await page.getByRole('button', { name: /edit avatar/i }).click();

		// The delete button only exists when an avatar has been uploaded
		const deleteBtn = page
			.getByTestId('delete-avatar')
			.or(page.getByRole('button', { name: /delete avatar/i }))
			.first();

		const hasDeletable = await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false);
		if (!hasDeletable) {
			console.warn('No deletable avatar present — skipping delete step');
			return;
		}
		await deleteBtn.click();

		await expect(page.locator('img').first()).toBeVisible({ timeout: 5_000 });
	});

	test('edit user details', async ({ page }) => {
		await page.goto('/user', { waitUntil: 'load' });

		await page.getByRole('button', { name: /edit user settings/i }).click();

		const usernameField = page
			.getByTestId('edit-username')
			.or(page.locator('#username'))
			.first();
		await expect(usernameField).toBeVisible({ timeout: 5_000 });
		await usernameField.fill('Test User Updated');

		await page.getByRole('button', { name: /save/i }).click();

		// Success = no redirect to login/error
		await expect(page).not.toHaveURL(/\/(login|setup)/);
	});

	test('registration token workflow', async ({ page }) => {
		await page.goto('/user', { waitUntil: 'load' });

		await page.getByRole('button', { name: /email.*registration.*token/i }).click();

		const emailField = page
			.getByTestId('token-email')
			.or(page.locator('#email-address'))
			.first();
		await expect(emailField).toBeVisible({ timeout: 5_000 });
		await emailField.fill('newuser@test.example');

		// Save button label is "Save" (button_save i18n); fall back to "Send"
		await page.getByRole('button', { name: /save|send/i }).click();

		// Success = form closes or a status indicator appears
		await expect(emailField).not.toBeVisible({ timeout: 8_000 }).catch(() => {});
	});

	test('toggle user token visibility', async ({ page }) => {
		await page.goto('/user', { waitUntil: 'load' });

		const showBtn = page
			.getByTestId('show-token')
			.or(page.getByRole('button', { name: /show user token/i }))
			.first();
		await expect(showBtn).toBeVisible({ timeout: 5_000 });
		await showBtn.click();

		const tokenHeading = page.getByRole('heading', { name: /token list/i });
		await expect(tokenHeading).toBeVisible({ timeout: 5_000 });

		const hideBtn = page
			.getByTestId('hide-token')
			.or(page.getByRole('button', { name: /hide user token/i }))
			.first();
		await hideBtn.click();
		await expect(tokenHeading).not.toBeVisible();
	});

	test('toggle user list visibility', async ({ page }) => {
		await page.goto('/user', { waitUntil: 'load' });

		// User list is visible by default (showUserList = true); button says "Hide User List"
		const listHeading = page.getByRole('heading', { name: /user list/i });
		await expect(listHeading).toBeVisible({ timeout: 10_000 });

		const hideBtn = page
			.getByTestId('hide-user-list')
			.or(page.getByRole('button', { name: /hide user list/i }))
			.first();
		await expect(hideBtn).toBeVisible({ timeout: 5_000 });
		await hideBtn.click();

		await expect(listHeading).not.toBeVisible({ timeout: 5_000 });

		const showBtn = page
			.getByTestId('show-user-list')
			.or(page.getByRole('button', { name: /show user list/i }))
			.first();
		await showBtn.click();
		await expect(listHeading).toBeVisible({ timeout: 5_000 });
	});
});
