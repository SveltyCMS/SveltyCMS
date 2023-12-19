import { test } from '@playwright/test';

test('Test loading', async ({ page }) => {
	await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
	console.log('Current URL:', page.url());
  
	await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded' });

	// Expect this page
	await page.locator('p').filter({ hasText: 'Sign Up' });
	await page.locator('p').filter({ hasText: 'Sign In' });
	await page.getByText('SimpleCMS').nth(2);

});

// Test language selection and button text
test('check language selection and button text', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
  
	console.log('check language selection and button text');
	const inputSelector = 'input[type="text"][list="locales"]';
	await page.fill(inputSelector, 'de');
	await page.waitForSelector(inputSelector, { state: 'visible', timeout: 60000 });
	await page.press(inputSelector, 'Enter');
	await page.fill(inputSelector, 'en');
	await page.waitForSelector(inputSelector, { state: 'visible', timeout: 60000 });
	await page.press(inputSelector, 'Enter');
});

// Test Signup First User
test('SignUp First User', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Test SignUp First User');
  
	await page.locator('p').filter({ hasText: 'Sign Up' }).click();
	await page.locator('div').filter({ hasText: 'Sign Up' });
	await page.locator('span').filter({ hasText: ': User' });

	// Test Username
	await page.locator('#username').fill('T');
	await page.locator('#username').press('Tab');
	await page.locator('span').filter({ hasText: 'Name must be at least 2 characters' });

	await page.locator('#username').fill('Test');

	//Test Email
	await page.locator('form').filter({ hasText: 'Username * Email Address * Password * Confirm Password *' }).locator('#email-address').fill('tes');
	await page.locator('span').filter({ hasText: 'Email must be a valid email' });
	await page
		.locator('form')
		.filter({ hasText: 'Username * Email Address * Password * Confirm Password *' })
		.locator('#email-address')
		.fill('test@test2.de');
	await page.locator('form').filter({ hasText: 'Username * Email Address * Password * Confirm Password *' }).locator('#password').fill('Test123');
	await page.locator('form').filter({ hasText: 'Username * Email Address * Password * Confirm Password *' }).locator('#password').press('Tab');
	await page.locator('span').filter({
		hasText:
			'Password must be a minimum of 8 characters & contain at least one letter, one number, and one special character,String must contain at least 8 character(s)'
	});

	await page
		.locator('form')
		.filter({ hasText: 'Username * Email Address * Password * Password must be a minimum of 8 characters' })
		.locator('#password')
		.fill('Test123!');
	await page.locator('#confirm-password').fill('Test1234!');
	await page.getByText('Password & Confirm password must match');
	await page.locator('#confirm-password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign Up' }).click();
	// 	//Test not login to Dashboard
	await page.goto('http://localhost:4173/en/Posts');
});

// Signout user after login
test('SignOut', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Signing out test');
  
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page
		.locator('form')
		.filter({ hasText: 'Email Address * Password * Sign In' })
		.locator('#email-address')
		.fill('test@test.de', { timeout: 60000 });

	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();
	const pageContentElement = (await page.$('#page-content')) ?? null;
	if (pageContentElement) {
		const buttonsInsidePageContent = await pageContentElement.$$('button');
		await buttonsInsidePageContent[0].click();
	}
	await page.getByTestId('app-shell').locator('div').filter({ hasText: 'Sign Out' }).nth(3);
	const signOutButton = await page.$('.btn-icon[value="Sign out"]');
	if (signOutButton) {
		await signOutButton.click();
	}

	await page.goto('http://localhost:4173/login');
});

test('Login First User', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Login First User');
  
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test', { timeout: 60000 });
	await page.locator('span').filter({ hasText: 'Email must be a valid email' });
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#email-address').fill('test@test2.de');
	await page.locator('form').filter({ hasText: 'Email Address * Password * Sign In' }).locator('#password').fill('Test123!');
	await page.getByRole('button', { name: 'Sign In' }).click();

	await page.goto('http://localhost:4173/en/Posts');
});

test('Forgot Password', async ({ page }) => {
	await page.goto('http://localhost:4173/login');
	console.log('Forgot Password');
  
	await page.locator('p').filter({ hasText: 'Sign In' }).click();
	const forgottenPasswordButton = await page.waitForSelector('button:has-text("Forgotten Password")');
	await forgottenPasswordButton.click();
	(await page.locator('#email-address')).nth(0).fill('test@test2.de');
	const sendPasswordEmail = await page.waitForSelector('button:has-text("Send Password Reset Email")');
	await sendPasswordEmail.click();
	await page
		.locator('form')
		.filter({ hasText: 'Password * Confirm Password * Registration Token' })
		.locator('#password')
		.nth(0)
		.fill('Test123!', { timeout: 60000 });
	await page
		.locator('form')
		.filter({ hasText: 'Password * Confirm Password * Registration Token' })
		.locator('#confirm-password')
		.nth(0)
		.fill('Test123!', { timeout: 60000 });

	const saveNewPassword = await page.waitForSelector('button:has-text("Save New Password")');
	await saveNewPassword.click();
});
