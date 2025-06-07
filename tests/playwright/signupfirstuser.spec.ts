import { test, expect } from '@playwright/test';

test('Test loading', async ({ page }) => {
	await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
	console.log('Current URL:', page.url());

	await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded' });

	// Expect this page elements
	await expect(page.locator('p:has-text("Sign Up")')).toBeVisible();
	await expect(page.locator('p:has-text("Sign In")')).toBeVisible();
	await expect(page.getByText('SveltyCMS').nth(2)).toBeVisible();
});

// Test language selection and button text
test('Check language selection and button text', async ({ page }) => {
	await page.goto('http://localhost:4173/login');

	console.log('Check language selection and button text');
	const inputSelector = 'input[type="text"][list="locales"]';
	await page.fill(inputSelector, 'de');
	await page.press(inputSelector, 'Enter');
	await page.fill(inputSelector, 'en');
	await page.press(inputSelector, 'Enter');
	await page.waitForSelector(inputSelector, { state: 'visible', timeout: 60000 });
});

// Test Signup First User
test('SignUp First User', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Test SignUp First User');

	await page.locator('p:has-text("Sign Up")').click();
	await expect(page.locator('div:has-text("Sign Up")')).toBeVisible();
	await expect(page.locator('span:has-text(": User")')).toBeVisible();

	// Test Username
	await page.locator('#username').fill('T');
	await page.locator('#username').press('Tab');
	await expect(page.locator('span:has-text("Name must be at least 2 characters")')).toBeVisible();

	await page.locator('#username').fill('Test');

	// Test Email
	await page.locator('#email-address').fill('tes');
	await expect(page.locator('span:has-text("Email must be a valid email")')).toBeVisible();
	await page.locator('#email-address').fill('test@test2.de');

	// Test Password
	await page.locator('#password').fill('Test123');
	await page.locator('#password').press('Tab');
	await expect(page.locator('span:has-text("Password must be a minimum of 8 characters")')).toBeVisible();

	await page.locator('#password').fill('Test123!');
	await page.locator('#confirm-password').fill('Test1234!');
	await expect(page.getByText('Password & Confirm password must match')).toBeVisible();
	await page.locator('#confirm-password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign Up' }).click();

	// Verify navigation after sign up
	await expect(page).toHaveURL('http://localhost:4173/en/Posts');
});

// Signout user after login
test('SignOut', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Signing out test');

	await page.locator('p:has-text("Sign In")').click();
	await page.locator('#email-address').fill('test@test.de');
	await page.locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();

	const signOutButton = await page.locator('button[value="Sign out"]');
	if (signOutButton) {
		await signOutButton.click();
		await expect(page).toHaveURL('http://localhost:4173/login');
	}
});

test('Login First User', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Login First User');

	await page.locator('p:has-text("Sign In")').click();
	await page.locator('#email-address').fill('test@test2.de');
	await expect(page.locator('span:has-text("Email must be a valid email")')).not.toBeVisible();
	await page.locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();

	await expect(page).toHaveURL('http://localhost:4173/en/Posts');
});

test('Forgot Password', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Forgot Password');

	await page.locator('p:has-text("Sign In")').click();
	await page.locator('button:has-text("Forgotten Password")').click();
	await page.locator('#email-address').fill('test@test2.de');
	await page.getByRole('button', { name: 'Send Password Reset Email' }).click();

	// Assume this navigates to the password reset page
	await page.locator('#password').fill('Test123!');
	await page.locator('#confirm-password').fill('Test123!');
	await page.getByRole('button', { name: 'Save New Password' }).click();

	await expect(page).toHaveURL('http://localhost:4173/login');
});
