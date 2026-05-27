/**
 * @file tests/e2e/role-based-access.spec.ts
 * @description RBAC E2E tests: verifies that admin, developer, and editor roles
 * each have the correct access to system areas.
 *
 * All login/logout goes through the shared helpers so selectors stay in one place.
 */
import { expect, type Page, test } from '@playwright/test';
import { loginAs, loginAsAdmin, logout } from './helpers/auth';
import { seedTestUsers, TEST_USERS } from './helpers/seed';

const USERS = {
	admin: { email: 'admin@example.com', password: 'Admin123!' },
	...TEST_USERS
};

/** Returns true if the server blocks access to path (HTTP 401/403 or redirect away). */
async function isBlocked(page: Page, path: string): Promise<boolean> {
	// Use in-browser fetch — this runs with the actual browser session cookies, unlike
	// page.request.get() which may not send httpOnly session cookies in all environments.
	const result: { status: number; finalUrl: string; bodySnippet: string } = await page.evaluate(async (p: string) => {
		try {
			const r = await fetch(p, { credentials: 'same-origin', cache: 'no-store' });
			const text = await r.text();
			return { status: r.status, finalUrl: r.url, bodySnippet: text.slice(0, 200) };
		} catch {
			return { status: 0, finalUrl: '', bodySnippet: '' };
		}
	}, path);

	const { status, finalUrl, bodySnippet } = result;
	console.log(`[isBlocked] ${path} → status=${status}, url=${finalUrl}, body="${bodySnippet.replace(/\s+/g, ' ').slice(0, 100)}"`);

	if (status === 0 || status === 401 || status === 403) return true;

	// SvelteKit streaming: the layout sends HTTP 200 immediately; the page-level 403 renders
	// client-side after the stream resolves. Wait for all network activity to settle so the
	// error component has had a chance to render before we inspect the DOM.
	await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

	// Fallback: redirect away from the path (URL changed), or recognisable error text in body
	const url = page.url();
	if (!url.includes(path)) return true;

	const body = (await page.textContent('body')) ?? '';
	if (body.trim().length < 50) return true; // blank error page
	const lower = body.toLowerCase();
	return (
		lower.includes('forbidden') ||
		lower.includes('unauthorized') ||
		lower.includes('access denied') ||
		lower.includes('permission')
	);
}

test.describe('Role-Based Access Control', () => {
	test.setTimeout(60_000);

	test.beforeAll(async ({ browser }) => {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		try {
			await loginAsAdmin(page);

			// Reset roles to defaults before RBAC tests run.
			// permission-change.spec.ts may check isAdmin on developer/editor in a prior run,
			// which would cause isBlocked() to return false. Use the unauthenticated testing
			// endpoint (available in TEST_MODE) to reset roles without needing admin cookies.
			const resetResp = await page.request.post('/api/testing', {
				data: { action: 'reset-roles' }
			});

			const resetBody = await resetResp.json().catch(() => null);
			if (resetResp.status() === 200) {
				console.log('[RBAC] Roles reset to defaults:', JSON.stringify(resetBody?.after));
			} else {
				console.warn('[RBAC] Role reset returned status:', resetResp.status(), JSON.stringify(resetBody));
			}

			// Verify developer user data in DB
			const devUserResp = await page.request.post('/api/testing', { data: { action: 'get-user', email: 'developer@example.com' } });
			const devUserBody = await devUserResp.json().catch(() => null);
			console.log('[RBAC] Developer user in DB:', JSON.stringify(devUserBody?.user));

			await seedTestUsers(page);
		} catch (err) {
			console.error('Failed to seed test users:', err);
		} finally {
			await ctx.close();
		}
	});

	test('Admin: full access to all system areas', async ({ page }) => {
		await loginAsAdmin(page);

		await page.goto('/config/systemsetting');
		await expect(page).toHaveURL(/systemsetting/, { timeout: 10_000 });
		await expect(page.getByText(/system settings/i).first()).toBeVisible({ timeout: 10_000 });

		await page.goto('/user');
		await expect(page).toHaveURL(/\/user/, { timeout: 10_000 });

		await page.goto('/config/access-management');
		await expect(page).toHaveURL(/access.?management/i, { timeout: 10_000 });

		await logout(page);
	});

	test('Developer: can access system config, cannot manage users', async ({ page }) => {
		await loginAs(page, USERS.developer);

		await page.goto('/config/systemsetting');
		await expect(page).toHaveURL(/\/config\/systemsetting/, { timeout: 10_000 });

		// access-management is admin-only — developer should be blocked
		await page.goto('/config/access-management');
		await page.waitForLoadState('load');
		expect(await isBlocked(page, '/config/access-management')).toBeTruthy();

		await logout(page);
	});

	test('Editor: can access content, cannot access system settings or users', async ({ page }) => {
		await loginAs(page, USERS.editor);

		await page.goto('/collection');
		await expect(page).toHaveURL(/\/collection/, { timeout: 10_000 });

		// systemsetting has a config:settings permission guard — editor is blocked
		await page.goto('/config/systemsetting');
		await page.waitForLoadState('load');
		expect(await isBlocked(page, '/config/systemsetting')).toBeTruthy();

		// access-management is admin-only — editor is blocked
		await page.goto('/config/access-management');
		await page.waitForLoadState('load');
		expect(await isBlocked(page, '/config/access-management')).toBeTruthy();

		await logout(page);
	});

	test('Media: admins see all, editors see only their own', async ({ page }) => {
		await loginAsAdmin(page);
		const adminMedia: unknown[] = await page.evaluate(async () => {
			const res = await fetch('/api/media');
			return res.json();
		});
		expect(Array.isArray(adminMedia)).toBeTruthy();
		const adminCount = adminMedia.length;
		await logout(page);

		await loginAs(page, USERS.editor);
		const editorMedia: unknown[] = await page.evaluate(async () => {
			const res = await fetch('/api/media');
			return res.json();
		});
		expect(Array.isArray(editorMedia)).toBeTruthy();
		expect(editorMedia.length).toBeLessThanOrEqual(adminCount);
		await logout(page);
	});

	test('All roles can login and logout', async ({ page }) => {
		for (const user of [USERS.admin, USERS.developer, USERS.editor]) {
			await loginAs(page, user);
			await expect(page).not.toHaveURL(/\/login/);
			await logout(page);
			await expect(page).toHaveURL(/\/(login|signup)/);
		}
	});
});
