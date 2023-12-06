import { test } from '@playwright/test';

test('Test loading', async ({ page }) => {
	console.log('Current URL:', page.url());
	await page.screenshot({ path: 'error-screenshot.png' });
	await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
	await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
	// await expect(page).toHaveTitle(/SimpleCMS/)

	// Expect this page
	await page.locator('p').filter({ hasText: 'Sign Up' });
	await page.locator('p').filter({ hasText: 'Sign In' });
	await page.getByText('SimpleCMS').nth(2);

	//await expect(page).toHaveTitle(/SimpleCMS/);
});

// Test language selection and button text
// test('check language selection and button text', async ({ page }) => {
// 	await page.goto('http://localhost:5173/login');
// 	await page.getByRole('combobox');
// 	await page.getByRole('combobox').selectOption('de');
// 	await page.locator('p').filter({ hasText: 'Anmelden' });
// 	await page.locator('p').filter({ hasText: 'Registrieren' });
// 	await page.getByRole('combobox');
// 	await page.getByRole('combobox').selectOption('en');
// });

// Test Signup First User
// test('SignUp First User', async ({ page }) => {
// 	await page.goto('http://localhost:5173/login');
// 	await page.locator('p').filter({ hasText: 'Sign Up' }).click();
// 	await page.getByText('Sign Up : Admin').click();
// 	// Test Username
// 	await page.locator('#username').click();
// 	await page.locator('#username').fill('T');
// 	await page.locator('#username').press('Tab');
// 	await page.getByText('String must contain at least 2 character(s)').click();
// 	await page.locator('#username').click();
// 	await page.locator('#username').fill('Test');

// 	//Test Email
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Password * Confirm Password * Sign Up OAuth' })
// 		.locator('#email-address')
// 		.click();
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Password * Confirm Password * Sign Up OAuth' })
// 		.locator('#email-address')
// 		.fill('tes');
// 	await page.locator('section').filter({ hasText: 'SimpleCMS Sign Up : Admin * Required Username * Email Address * Password * Confi' }).click();
// 	await page.getByText('Invalid email').click();
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Invalid email Password * Confirm Password * Sign Up O' })
// 		.locator('#email-address')
// 		.click();
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Invalid email Password * Confirm Password * Sign Up O' })
// 		.locator('#email-address')
// 		.fill('test@test.de');
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Password * Confirm Password * Sign Up OAuth' })
// 		.locator('#password')
// 		.fill('Test123');
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Password * Confirm Password * Sign Up OAuth' })
// 		.locator('#password')
// 		.press('Tab');
// 	await page.getByText('Invalid,String must contain at least 8 character(s)').click();
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Password * Invalid,String must contain at least 8 cha' })
// 		.getByRole('button')
// 		.first()
// 		.click();
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Password * Invalid,String must contain at least 8 cha' })
// 		.locator('#password')
// 		.click();
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Password * Invalid,String must contain at least 8 cha' })
// 		.locator('#password')
// 		.fill('Test123!');
// 	await page.locator('#confirm-password').click();
// 	await page.locator('#confirm-password').fill('Test1234!');
// 	await page
// 		.locator('form')
// 		.filter({ hasText: 'Username * Email Address * Password * Confirm Password * Sign Up OAuth' })
// 		.locator('#password')
// 		.click();
// 	//missing Error message for Confirm Password
// 	await page.locator('#confirm-password').click();
// 	await page.locator('#confirm-password').fill('Test123!');
// 	await page.getByRole('button', { name: 'Sign Up' }).click();
// 	//Test not login to Dashboard
// 	await page.goto('http://localhost:5173/en/Posts');
// });

// test('SignOut', async ({ page }) => {
// 	await page.goto('http://localhost:5173/en/Posts');
//  await page.getByText('Posts').click();
//  await page.getByTestId('app-shell').locator('div').filter({ hasText: 'Sign Out' }).nth(3)
//  await page.locator('.order-4 > .btn-icon').click();
//  await page.goto('http://localhost:5173/login');
//   });

// test('Login First User', async ({ page }) => {
// 	await page.goto('http://localhost:5173/login');
// 	await page.locator('p').filter({ hasText: 'Sign In' }).click();
// 	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In OAuth Forgotten Password' }).locator('#email-address').click();
// 	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In OAuth Forgotten Password' }).locator('#email-address').fill('test');
// 	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In OAuth Forgotten Password' }).locator('#password').click();
// 	await page.getByText('Invalid email').click();
// 	await page.locator('form').filter({ hasText: 'Email Address * Invalid email Password * Sign In OAuth Forgotten Password' }).locator('#email-address').click();
// 	await page.locator('form').filter({ hasText: 'Email Address * Invalid email Password * Sign In OAuth Forgotten Password' }).locator('#email-address').fill('test@test.de');
// 	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In OAuth Forgotten Password' }).locator('#password').click();
// 	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In OAuth Forgotten Password' }).locator('#password').fill('Test123!');
// 	await page.getByRole('button', { name: 'Sign In' }).click();

// 	await page.goto('http://localhost:5173/en/Posts');
//   });
