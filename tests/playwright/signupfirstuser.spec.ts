/**
 * @file tests/playwright/signupfirstuser.spec.ts
 * @description Playwright end-to-end tests for first user signup and authentication flows in SveltyCMS.
 *   - Loads homepage and login screen
 *   - Verifies language selection updates UI
 *   - Signs up the first user and checks validations
 *   - Tests sign out, login, and forgot password flows
 */
import { test, expect } from '@playwright/test';
import { logout } from './helpers/auth';

test.describe.configure({ timeout: 60000 }); // Set timeout for all tests

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';

test('Test loading homepage and login screen', async ({ page }) => {
	// Going to / should redirect to /login for unauthenticated users
	await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
	await expect(page).toHaveURL(`${baseURL}/login`);

	await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });

	await expect(page.getByText(/sign up/i)).toBeVisible();
	await expect(page.getByText(/sign in/i)).toBeVisible();
});

// ✅ Language selection test (dropdown version)
// TODO: This test uses incorrect languages - only 'en' and 'de' exist in the codebase
// Needs rewrite similar to language.spec.ts
test.skip('Check language selection updates UI text', async ({ page }) => {
	await page.goto(`${baseURL}/login`);

	const languageSelector = 'select'; // Update if needed

	const languages = [
		{ code: 'de', expected: /anmelden/i }, // Sign In in German
		{ code: 'fr', expected: /se connecter/i }, // French - DOESN'T EXIST
		{ code: 'es', expected: /iniciar sesión/i }, // Spanish - DOESN'T EXIST
		{ code: 'en', expected: /sign in/i } // English
	];

	for (const lang of languages) {
		await page.selectOption(languageSelector, lang.code);
		await page.waitForTimeout(500); // Wait for UI update
		await expect(page.getByRole('button', { name: lang.expected })).toBeVisible();
	}
});

// ⚠️ SKIPPED: This test tries to sign up via /login, but first-user signup must go through /setup wizard
// The signUp action requires a valid invitation token, which this test doesn't have
test.skip('SignUp First User', async ({ page }) => {
	await page.goto(`${baseURL}/login`);
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

	// Submit - use exact aria-label match
	await page.getByLabel('Sign Up').click({ force: true });

	// Final assert
	await expect(page).toHaveURL(new RegExp(`${baseURL}/(en/)?Posts`));
});

// ✅ SignOut Test
test('SignOut after login', async ({ page }) => {
	// Logout first to ensure clean state
	await logout(page);

	await page.goto(`${baseURL}/login`);

	// Use data-testid selectors
	await page.getByTestId('signin-email').fill('test@test.de');
	await page.getByTestId('signin-password').fill('Test123!');
	await page.getByTestId('signin-submit').click();

	const signOutButton = page.locator('button[value="Sign out"]');
	if (await signOutButton.isVisible()) {
		await signOutButton.click();
		await expect(page).toHaveURL(`${baseURL}/login`);
	}
});

// ✅ Login First User
test('Login First User', async ({ page }) => {
	// Logout first to ensure clean state
	await logout(page);

	await page.goto(`${baseURL}/login`);

	// Use data-testid selectors
	await page.getByTestId('signin-email').fill('test@test2.de');
	await page.getByTestId('signin-password').fill('Test123!');
	await page.getByTestId('signin-submit').click();

	await expect(page).toHaveURL(new RegExp(`${baseURL}/(en/)?Posts`));
});

// ✅ Forgot Password
test('Forgot Password Flow', async ({ page }) => {
	// Logout first to ensure clean state
	await logout(page);

	await page.goto(`${baseURL}/login`);

	// Use data-testid selectors
	await page.getByTestId('forgot-password-button').click();
	await page.getByTestId('forgot-email').fill('test@test2.de');
	await page.getByRole('button', { name: /send password reset email/i }).click();

	// Assume redirected to reset form
	await page.getByTestId('reset-password').fill('Test123!');
	await page.getByTestId('reset-confirm-password').fill('Test123!');
	await page.getByRole('button', { name: /save new password/i }).click();

	await expect(page).toHaveURL(`${baseURL}/login`);
});
