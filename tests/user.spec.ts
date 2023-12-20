import { test, expect } from '@playwright/test';


test('Login User', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Login User test');

// test for all /user
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	page.waitForTimeout(3000);

});

test('Edit Avatar', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Edit Avatar test');

	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForTimeout(10000);
	await page.goto('http://localhost:4173/en/Names');
	await page.goto('http://localhost:4173/user');
	await page.locator('h1').filter({ hasText: 'User Profile' }).waitFor({ state: 'visible', timeout: 60000 });
	await page.locator('//button[text()="Edit Avatar"]').click();
	await page.locator('input[type="file"]').waitFor({ state: 'visible', timeout: 60000 });
	const fileInput = await page.locator('input[type="file"]');
	await fileInput.setInputFiles('/tests/testthumb.png');
	page.on('filechooser', async (fileChooser) => {
		await fileChooser.setFiles('/tests/testthumb.png');
	});
	await page.getByRole('button').filter({ hasText: 'Save' }).click();
	page.waitForTimeout(3000);
});

test('Delete Avatar', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Delete Avatar test');

	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForTimeout(10000);
	await page.goto('http://localhost:4173/user');
	await page.locator('button').filter({ hasText: 'Edit Avatar' }).click();
	await page.locator('button.variant-filled-error').click();
	page.waitForTimeout(3000);
});

test('Edit User Details', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Edit User Details test');

	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForTimeout(10000);
;
	await page.goto('http://localhost:4173/user');

	await page.locator('button').filter({ hasText: 'Edit User Settings:' }).click();
	await page.locator('#username').fill('Test User');
	await page.locator('#password').fill('Test123!');
	await page.locator('#confirm_password').fill('Test123!');
	await page.getByRole('button').filter({ hasText: 'Save' }).click();
	page.waitForTimeout(3000);


});

test('Registration Token', async ({ page }) => {
	await page.goto('http://localhost:4173/login')
	console.log('Registration Token test');

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
	page.waitForTimeout(3000);

});

test('Show or Hide User Token', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Show or Hide User Token');

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
	page.waitForTimeout(3000);

});

test('Show or Hide User List', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Show or Hide User List test');

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

	page.waitForTimeout(3000);
});
