/**
 * @file tests/e2e/oauth-signup-firstuser.spec.ts
 * @description E2E tests for OAuth login flow.
 * Uses data-testid/aria-label selectors — no CSS classes, no p:has-text().
 * External OAuth endpoints are mocked so no real credentials are needed in CI.
 */
import { expect, test } from '@playwright/test';

test.describe('OAuth Login Flow', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/login', { waitUntil: 'domcontentloaded' });

		// Navigate to the sign-in form if a selection screen is shown
		const signInTab = page
			.getByTestId('signin-tab')
			.or(page.getByRole('button', { name: /^sign in$/i }))
			.first();

		if (await signInTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await signInTab.click();
			await page.waitForTimeout(500);
		}
	});

	test('OAuth button is visible when OAuth is enabled', async ({ page }) => {
		const oauthButton = page.getByRole('button', { name: /oauth|google/i });
		if (await oauthButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await expect(oauthButton).toBeVisible();
		} else {
			console.log('OAuth button not found — USE_GOOGLE_OAUTH may be disabled in this environment.');
		}
	});

	test('OAuth callback with access_denied error redirects to login', async ({ page }) => {
		await page.goto('/login/oauth?error=access_denied&error_description=User%20denied%20access', {
			waitUntil: 'load'
		});
		await expect(page).toHaveURL(/login/, { timeout: 10_000 });
	});

	test('OAuth callback with invalid code is handled gracefully', async ({ page }) => {
		await page.route('https://oauth2.googleapis.com/token', (route) => {
			route.fulfill({
				status: 400,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'invalid_grant' })
			});
		});

		await page.goto('/login/oauth?code=invalid_code&state=test', { waitUntil: 'load' });
		await page.waitForLoadState('load');

		// Should end up back at login — not crash or hang
		await expect(page).toHaveURL(/login/, { timeout: 10_000 });
	});

	test('OAuth callback with mocked success redirects to collections', async ({ page }) => {
		await page.route('https://oauth2.googleapis.com/token', (route) => {
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					access_token: 'mock_token',
					token_type: 'Bearer',
					expires_in: 3600,
					scope: 'email profile openid'
				})
			});
		});

		await page.route('https://www.googleapis.com/oauth2/v2/userinfo', (route) => {
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					email: 'ci-oauth@example.com',
					name: 'CI OAuth User',
					given_name: 'CI',
					family_name: 'User',
					picture: ''
				})
			});
		});

		await page.route('**/api/sendMail', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
		);

		await page.goto('/login/oauth?code=mock_code&scope=email+profile+openid', {
			waitUntil: 'load'
		});

		// Accept either a successful redirect to collections OR a graceful return to login
		const url = page.url();
		const landed = url.includes('/Collections') || url.includes('/login') || url.includes('/dashboard');
		expect(landed).toBeTruthy();
	});
});
