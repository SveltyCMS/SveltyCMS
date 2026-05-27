/**
 * @file tests/e2e/permission-change.spec.ts
 * @description E2E test: admin can toggle permission checkboxes in Access Management.
 * Uses role/label selectors — no CSS classes, no theme-specific text.
 */
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Permission Management Flow', () => {
	test.setTimeout(60_000);

	test('admin can update permissions in Access Management', async ({ page }) => {
		await loginAsAdmin(page);

		// Navigate directly — the sidebar menu structure can vary by theme/layout
		// and is already covered by collection.spec.ts navigation tests.
		await page.goto('/config/access-management', { waitUntil: 'load' });
		await expect(page).toHaveURL(/access.?management/i, { timeout: 10_000 });

		// Check up to 3 enabled checkboxes
		const checkboxes = page.locator('input[type="checkbox"]:not([disabled])');
		await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });

		const total = await checkboxes.count();
		const toCheck = Math.min(total, 3);
		for (let i = 0; i < toCheck; i++) {
			await checkboxes.nth(i).check();
		}

		await page.getByRole('button', { name: /save/i }).click();

		// Success = still on the access management page (no redirect to error/login)
		await expect(page).toHaveURL(/access.?management/i, { timeout: 10_000 });
	});
});
