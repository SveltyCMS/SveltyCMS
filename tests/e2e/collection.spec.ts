/**
 * @file tests/e2e/collection.spec.ts
 * @description E2E test: admin can navigate to collections and perform basic actions.
 * Avoids asserting on collection names (those change per DB seed).
 * Uses role/testid selectors — no CSS classes.
 */
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Collections', () => {
	test.setTimeout(120_000);

	test('admin can reach the collections area after login', async ({ page }) => {
		await loginAsAdmin(page);

		// After login we should land somewhere in the app — not on login/setup
		await expect(page).not.toHaveURL(/\/(login|setup)/);

		// Navigate explicitly to confirm collections route is accessible
		await page.goto('/config/collectionbuilder', { waitUntil: 'load' });

		// The page should load without redirecting to login
		await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
	});

	test('admin can open the collection builder page', async ({ page }) => {
		await loginAsAdmin(page);
		await page.goto('/config/collectionbuilder', { waitUntil: 'load' });

		// Confirm a main heading is present (any heading — theme-agnostic)
		const heading = page.getByRole('heading').first();
		await expect(heading).toBeVisible({ timeout: 10_000 });
	});

	test('admin can open system configuration', async ({ page }) => {
		await loginAsAdmin(page);

		const sysConfigBtn = page.getByRole('button', { name: /system configuration/i }).first();
		await expect(sysConfigBtn).toBeVisible({ timeout: 10_000 });
		await sysConfigBtn.click();

		// At least one link should appear in the config menu
		const firstLink = page.getByRole('link').first();
		await expect(firstLink).toBeVisible({ timeout: 5_000 });
	});
});
