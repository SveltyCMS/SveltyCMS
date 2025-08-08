/**
 * @file user.spec.ts
 * @description Playwright end-to-end tests for user profile and token management in SveltyCMS.
 *   - Login user
 *   - Edit and delete avatar
 *   - Edit user details
 *   - Manage registration tokens and user lists
 */
import { test, expect } from '@playwright/test';

async function loginUser(page) {
	console.log('Logging in...');
	await page.goto('http://localhost:5173/login');
	await page.locator('p:has-text("Sign In")').click();
	await page.locator('#email-address').fill('test@test.de');
	await page.locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForNavigation();
}

test('Login User', async ({ page }) => {
	await loginUser(page);
	console.log('Login User test');
	expect(page.url()).toBe('http://localhost:5173/');
});

test('Edit Avatar', async ({ page }) => {
	await loginUser(page);
	console.log('Edit Avatar test');
	await page.goto('http://localhost:5173/user');
	await page.locator('h1:has-text("User Profile")').waitFor({ state: 'visible' });
	await page.locator('button:has-text("Edit Avatar")').click();
	const fileInput = await page.locator('input[type="file"]');
	await fileInput.setInputFiles('/tests/testthumb.png');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForSelector('img[src*="testthumb.png"]'); // Wait for the avatar to be updated
});

test('Delete Avatar', async ({ page }) => {
	await loginUser(page);
	console.log('Delete Avatar test');
	await page.goto('http://localhost:5173/user');
	await page.locator('button:has-text("Edit Avatar")').click();
	await page.locator('button.variant-filled-error').click(); // Assuming this is the delete button
	await page.waitForSelector('img[src*="default-avatar.png"]'); // Wait for the default avatar to reappear
});

test('Edit User Details', async ({ page }) => {
	await loginUser(page);
	console.log('Edit User Details test');
	await page.goto('http://localhost:5173/user');
	await page.locator('button:has-text("Edit User Settings:")').click();
	await page.locator('#username').fill('Test User');
	await page.locator('#password').fill('Test123!');
	await page.locator('#confirm_password').fill('Test123!');
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForSelector('p:has-text("User details updated")'); // Wait for a confirmation message
});

test('Registration Token', async ({ page }) => {
	await loginUser(page);
	console.log('Registration Token test');
	await page.goto('http://localhost:5173/user');
	await page.locator('span:has-text("Email User Registration token")').click();
	await page.locator('#email-address').fill('test@test.ge');
	const roleElement = await page.locator('span.capitalize:has-text("user")');
	if (roleElement) await roleElement.click();
	const timeElement = await page.locator('span.capitalize:has-text("12 hrs")');
	if (timeElement) await timeElement.click();
	await page.getByRole('button', { name: 'Send' }).click();
	await page.waitForSelector('p:has-text("Token sent")'); // Wait for a confirmation message
});

test('Show or Hide User Token', async ({ page }) => {
	await loginUser(page);
	console.log('Show or Hide User Token');
	await page.goto('http://localhost:5173/user');
	await page.locator('span:has-text("Show User Token")').click();
	await page.locator('h2:has-text("Token List:")').waitFor({ state: 'visible' });
	await page.locator('span:has-text("Hide User Token")').click();
	const listElement = await page.locator('h2:has-text("Token List:")');
	expect(await listElement.isVisible()).toBe(false);
});

test('Show or Hide User List', async ({ page }) => {
	await loginUser(page);
	console.log('Show or Hide User List test');
	await page.goto('http://localhost:5173/user');
	await page.locator('span:has-text("Show User List")').click();
	await page.locator('h2:has-text("User List:")').waitFor({ state: 'visible' });
	await page.locator('span:has-text("Hide User List")').click();
	const listElement = await page.locator('h2:has-text("User List:")');
	expect(await listElement.isVisible()).toBe(false);
});
