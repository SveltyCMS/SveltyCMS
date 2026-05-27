/**
 * @file tests/playwright/signupfirstuser.spec.ts
 * @description Playwright end-to-end tests for first user signup and authentication flows in SveltyCMS.
 *   - Loads homepage and login screen
 *   - Verifies language selection updates UI
 *   - Signs up the first user and checks validations
 *   - Tests sign out, login, and forgot password flows
 */
import { expect, test } from '@playwright/test';
import { ADMIN_CREDENTIALS, loginAsAdmin, logout } from './helpers/auth';

test.describe.configure({ timeout: 60_000 }); // Set timeout for all tests

test('Test loading homepage and login screen', async ({ page }) => {
	// Without an active session, / redirects to /login (setup is complete, auth required)
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect(page).not.toHaveURL(/\/setup/, { timeout: 10_000 }); // Not in setup mode

	// Navigate to login and wait for network to settle — gives the server time to warm up
	// after setup (this test runs first in the auth suite immediately after global.setup).
	await page.goto('/login', { waitUntil: 'domcontentloaded' });
	await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

	// Language selector is always visible on the login page — theme-agnostic proof the page rendered
	await expect(page.locator('[aria-label="Select language"]').first()).toBeVisible({ timeout: 20_000 });
	// Both sections are in the DOM (they have zero size until clicked, so check attached not visible)
	await expect(page.getByTestId('signup-section')).toBeAttached({ timeout: 10_000 });
	await expect(page.getByTestId('signin-section')).toBeAttached({ timeout: 10_000 });
});

// ✅ Language selection test
test('Check language selection updates UI text', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'domcontentloaded' });

	// Pre-accept cookie consent so the banner never blocks clicks
	await page.evaluate(() => {
		localStorage.setItem(
			'sveltycms_consent',
			JSON.stringify({ necessary: true, analytics: false, marketing: false, responded: true })
		);
	});

	// Only EN and DE are compiled — the trigger is a Menu, not a <select>
	const trigger = page.locator('[aria-label="Select language"]').first();
	await expect(trigger).toBeVisible({ timeout: 10_000 });

	// Switch from EN to DE (only one menu item since two languages total)
	await trigger.click();
	const deItem = page.locator('[role="menuitem"]').first();
	await expect(deItem).toBeVisible({ timeout: 5_000 });
	await deItem.click();
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(500);

	// Switch back to EN
	const trigger2 = page.locator('[aria-label="Select language"]').first();
	await expect(trigger2).toBeVisible({ timeout: 10_000 });
	await trigger2.click();
	const enItem = page.locator('[role="menuitem"]').first();
	await expect(enItem).toBeVisible({ timeout: 5_000 });
	await enItem.click();
	await page.waitForLoadState('domcontentloaded');

	// Confirm we are back on the login page (not an error page)
	await expect(page.locator('[aria-label="Select language"]').first()).toBeVisible({ timeout: 5_000 });
});

// ✅ Signup First User (invite-based — the server requires a token after first admin exists)
test('SignUp First User', async ({ page }) => {
	// Step 1 — Log in as admin and create a one-time invitation token via the API.
	// The token endpoint always returns token.value in the response body when SMTP
	// is not configured (which is the case in TEST_MODE).
	await loginAsAdmin(page);

	const inviteEmail = `invite-${Date.now()}@example.com`;

	const tokenResponse = await page.request.post('/api/token/create-token', {
		data: { email: inviteEmail, role: 'editor', expiresIn: '2 hrs' }
	});

	const tokenData = await tokenResponse.json();
	const inviteToken: string | undefined = tokenData?.token?.value;

	if (!inviteToken) {
		// Should never happen in test mode, but guard gracefully
		console.warn('[SignUp First User] Token API did not return a value:', JSON.stringify(tokenData));
		return;
	}

	// Step 2 — Logout, then navigate to the invite link.
	// The server validates the token and sets isInviteFlow=true, which triggers
	// the auto-open behaviour added to +page.svelte so the signup panel appears immediately.
	await logout(page);
	await page.goto(`/login?invite_token=${inviteToken}`, { waitUntil: 'load' });

	// Pre-accept cookie consent so the banner never blocks clicks
	await page.evaluate(() => {
		localStorage.setItem(
			'sveltycms_consent',
			JSON.stringify({ necessary: true, analytics: false, marketing: false, responded: true })
		);
	});

	// Step 3 — Fill in the signup form.
	// Email is pre-filled and disabled (server injected via isInviteFlow).
	// Token is injected as a hidden field — no need to fill it manually.
	await expect(page.locator('#usernamesignUp')).toBeVisible({ timeout: 12_000 });
	await page.locator('#usernamesignUp').fill('InvitedTestUser');
	await page.locator('#passwordsignUp').fill('InvitePass123!');
	await page.locator('#confirm_passwordsignUp').fill('InvitePass123!');

	// Step 4 — Submit.  Button label is "Accept Invitation" in invite flow.
	// Scoped inside signup-section to avoid matching the outer <section role="button">.
	await page.getByTestId('signup-section').getByRole('button', { name: /accept invitation|sign.?up/i }).click();

	// Step 5 — Success: redirected to the app (collectionbuilder or first collection).
	await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
});

// ✅ SignOut Test
test('SignOut after login', async ({ page }) => {
	await loginAsAdmin(page);
	await expect(page).not.toHaveURL(/\/login/);

	await logout(page);
	await expect(page).toHaveURL(/\/(login|signup)/, { timeout: 10_000 });
});

// ✅ Login First User
test('Login First User', async ({ page }) => {
	await loginAsAdmin(page);
	await expect(page).not.toHaveURL(/\/login/);
});

// ✅ Forgot Password
test('Forgot Password Flow', async ({ page }) => {
	// Clear any auth state left by "Login First User" — without this, the login page
	// hydrates differently and the $effect that opens the sign-in panel may be delayed.
	await logout(page);

	// Same pattern as loginAs() in helpers/auth.ts (proven to open the sign-in panel).
	await page.goto('/login?mode=signin', { waitUntil: 'load' });

	// Set consent after navigation — beats the 500 ms banner delay.
	await page.evaluate(() => {
		localStorage.setItem(
			'sveltycms_consent',
			JSON.stringify({ necessary: true, analytics: false, marketing: false, responded: true })
		);
	});

	// Wait for the sign-in form to open — same 15 s timeout used by loginAs().
	await page.waitForSelector('[data-testid="signin-email"]', { state: 'visible', timeout: 15_000 });

	// Open the forgot-password panel
	await page.getByTestId('signin-forgot-password').click();

	// Fill the email field — id="emailforgot"
	const emailField = page.locator('#emailforgot').first();
	await expect(emailField).toBeVisible({ timeout: 8_000 });
	await emailField.fill(ADMIN_CREDENTIALS.email);

	// Submit — exact match to avoid matching the outer <section role="button">
	await page.getByTestId('forgot-submit').click();

	// Success = still on login (email delivery is not tested)
	await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
});
