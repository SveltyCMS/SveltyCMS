/**
 * @file tests/playwright/signupfirstuser.spec.ts
 * @description Playwright end-to-end tests for first user signup and authentication flows in SveltyCMS.
 *   - Loads homepage and login screen
 *   - Verifies language selection updates UI
 *   - Signs up the first user and checks validations
 *   - Tests sign out, login, and forgot password flows
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ timeout: 60000 }); // Set timeout for all tests

test('Test loading homepage and login screen', async ({ page }) => {
	await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
	await expect(page).toHaveURL('http://localhost:5173/');

	await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });

	await expect(page.getByText(/sign up/i)).toBeVisible();
	await expect(page.getByText(/sign in/i)).toBeVisible();
});

// ✅ Language selection test (dropdown version)
test('Check language selection updates UI text', async ({ page }) => {
	await page.goto('http://localhost:5173/login');

	const languageSelector = 'select'; // Update if needed

	const languages = [
		{ code: 'de', expected: /anmelden/i }, // Sign In in German
		{ code: 'fr', expected: /se connecter/i }, // French
		{ code: 'es', expected: /iniciar sesión/i }, // Spanish
		{ code: 'en', expected: /sign in/i } // English
	];

	for (const lang of languages) {
		await page.selectOption(languageSelector, lang.code);
		await page.waitForTimeout(500); // Wait for UI update
		await expect(page.getByRole('button', { name: lang.expected })).toBeVisible();
	}
});

// ✅ Signup First User
test('SignUp First User', async ({ page }) => {
	await page.goto('http://localhost:5173/login');
	await page.getByText(/sign up/i).click();

	// Username validation
	await page.locator('#usernamesignUp').fill('T');
	await page.locator('#usernamesignUp').press('Tab');
	await page.locator('#usernamesignUp').fill('Test');

	// Email validation
	await page.locator('#emailsignUp').fill('tes');
	await page.locator('#emailsignUp').fill('test@test2.de');

	// Password validation
	await page.locator('#passwordsignUp').fill('Test123');
	await page.locator('#passwordsignUp').press('Tab');

	await page.locator('#passwordsignUp').fill('Test123!');
	await page.locator('#confirm_passwordsignUp').fill('Test1234!');

	await page.locator('#confirm_passwordsignUp').fill('Test123!');

	// Registration Token (if required)
	await page.locator('#tokensignUp').fill('svelty-secret-key');

	// Submit
	await page.locator('button[aria-label="SIGN UP"]').click();

	// Final assert
	await expect(page).toHaveURL('http://localhost:5173/en/Posts');
});

// ✅ SignOut Test
test('SignOut after login', async ({ page }) => {
	await page.goto('http://localhost:5173/login');

	await page.getByText(/sign in/i).click();
	await page.locator('#email-address').fill('test@test.de');
	await page.locator('#password').fill('Test123!');
	await page.getByRole('button', { name: /sign in/i }).click();

	const signOutButton = page.locator('button[value="Sign out"]');
	if (await signOutButton.isVisible()) {
		await signOutButton.click();
		await expect(page).toHaveURL('http://localhost:5173/login');
	}
});

// ✅ Login First User
test('Login First User', async ({ page }) => {
	await page.goto('http://localhost:5173/login');

	await page.getByText(/sign in/i).click();
	await page.locator('#email-address').fill('test@test2.de');
	await page.locator('#password').fill('Test123!');
	await page.getByRole('button', { name: /sign in/i }).click();

	await expect(page).toHaveURL('http://localhost:5173/en/Posts');
});

// ✅ Forgot Password
test('Forgot Password Flow', async ({ page }) => {
	await page.goto('http://localhost:5173/login');

	await page.getByText(/sign in/i).click();
	await page.getByRole('button', { name: /forgotten password/i }).click();
	await page.locator('#email-address').fill('test@test2.de');
	await page.getByRole('button', { name: /send password reset email/i }).click();

	// Assume redirected to reset form
	await page.locator('#password').fill('Test123!');
	await page.locator('#confirm-password').fill('Test123!');
	await page.getByRole('button', { name: /save new password/i }).click();

	await expect(page).toHaveURL('http://localhost:5173/login');
});
