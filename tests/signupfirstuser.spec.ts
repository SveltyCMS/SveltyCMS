import { test, expect } from '@playwright/test';

test('Loads', async ({ page }) => {
	await page.goto('http://localhost:5173/');

	// Expect a title "to contain" a substring.
	//await expect(page).toHaveTitle(/SimpleCMS/);
});

// Test language selection and button text
// test('check language selection and button text', async ({ page }) => {
// 	await page.goto('http://localhost:5173/login/');

// 	// Check that the default language is EN
// 	await page.waitForSelector('select[name="language"]');
// 	const defaultLanguage = await page.$eval('select[name="language"]', el => (el as HTMLSelectElement).value);
// 	expect(defaultLanguage).toBe('en');

// 	// Switch to DE
// 	await page.selectOption('select[name="language"]', 'de');

// 	// Check that the button text is "Registrieren"
// 	const registerBtnTextDE = await page.textContent('button[name="register"]');
// 	expect(registerBtnTextDE).toBe('Registrieren');

// 	// Switch back to EN
// 	await page.selectOption('select[name="language"]', 'en');

// 	// Check that the button text is "Sign Up"
// 	const registerBtnTextEN = await page.textContent('button[name="register"]');
// 	expect(registerBtnTextEN).toBe('Sign Up');
// });

// Test user registration
// test('register first user', async ({ page }) => {
// 	await page.goto('http://localhost:5173/login/');

// 	// Click on the Sign Up button
// 	await page.click('text="Sign Up"');

// 	// Fill out the username field
// 	await page.fill('input[name="username"]', 'testuser');

// 	// Fill out the email field
// 	await page.fill('input[name="email"]', 'test@test.com');

// 	// Fill out the password field
// 	await page.fill('input[name="password"]', 'Password123!');

// 	// Fill out the confirm password field
// 	await page.fill('input[name="confirm-password"]', 'Password123!');

// 	// Submit the form
// 	await page.click('button[type="submit"]');

// 	// Expect the user to be redirected to the dashboard or a success message
// 	// add your expectations here based on your application's behaviour after successful signup 
// 	// e.g., you might expect a certain URL or certain text to appear:
// 	await page.waitForNavigation();
// 	await expect(page).toHaveURL('http://localhost:5173/dashboard');
// });



