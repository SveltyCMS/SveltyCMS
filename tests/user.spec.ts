import { test, expect } from '@playwright/test';

test('Login User', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
});

test('Edit Avatar', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	// await page.waitForSelector('#page-content');
	await page.waitForTimeout(5000);
	// await page.locator('span').filter({ hasText: 'Create' }).waitFor({ state: 'visible' });
	await page.goto('http://localhost:4173/user');
	await page.waitForTimeout(5000);
	await page.locator('h1').filter({ hasText: 'User Profile' }).waitFor({ state: 'visible', timeout: 60000 });
	await page.locator('//button[text()="Edit Avatar"]').click();
	await page.locator('input[type="file"]').waitFor({ state: 'visible', timeout: 60000 });
	const fileInput = await page.locator('input[type="file"]');
	await fileInput.setInputFiles('/download.png');
	page.on('filechooser', async (fileChooser) => {
		await fileChooser.setFiles('/download.png');
	});
	await page.getByRole('button').filter({ hasText: 'Save' }).click();
});

test('Delete Avatar', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForTimeout(10000);
	// await page.locator('span').filter({ hasText: 'Create' }).waitFor({ state: 'visible' });
	await page.goto('http://localhost:4173/user');
	await page.waitForTimeout(10000);
	await page.locator('button').filter({ hasText: 'Edit Avatar' }).click();
	await page.locator('button.variant-filled-error').click();
});

test('Edit User Details', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForTimeout(10000);
	await page.waitForSelector('div:has-text("Names")');
	await page.goto('http://localhost:4173/user');
	await page.waitForTimeout(10000);
	await page.locator('button').filter({ hasText: 'Edit User Settings:' }).click();
	await page.locator('#username').fill('Test User');
	await page.locator('#password').fill('Test123!');
	await page.locator('#confirm_password').fill('Test123!');
	await page.getByRole('button').filter({ hasText: 'Save' }).click();
});

test('Registration Token', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForSelector('div:has-text("Names")');
	await page.goto('http://localhost:4173/user');
	await page.locator('span').filter({ hasText: 'Email User Registration token' }).click();
	await page.locator('#email-address').fill('test@test.ge');
	const roleElement = await page.$('span.capitalize:has-text("user")');
	if (roleElement) {
		await roleElement.click();
	}
	const timeEkement = await page.$('span.capitalize:has-text("12 hrs")');
	if (timeEkement) {
		await timeEkement.click();
	}
	await page.getByRole('button').filter({ hasText: 'Send' }).click();
});

test('Show or Hide User Token', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForSelector('div:has-text("Names")');
	await page.goto('http://localhost:4173/user');
	await page.locator('span').filter({ hasText: 'Show User Token' }).click();
	await page.locator('h2').filter({ hasText: 'Token List:' });
	await page.locator('span').filter({ hasText: 'Hide User Token' }).click();
	const listElement = await page.locator('h2').filter({ hasText: 'Token List:' });
	const isVisible = await listElement.isVisible();
	expect(isVisible).toEqual(false);
});

test('Show or Hide User List', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForSelector('div:has-text("Names")');
	await page.goto('http://localhost:4173/user');
	await page.locator('span').filter({ hasText: 'Show User List' }).click();
	await page.locator('h2').filter({ hasText: 'User List:' });
	await page.locator('span').filter({ hasText: 'Hide User List' }).click();
	const listElement = await page.locator('h2').filter({ hasText: 'User List:' });
	const isVisible = await listElement.isVisible();
	expect(isVisible).toEqual(false);
});
