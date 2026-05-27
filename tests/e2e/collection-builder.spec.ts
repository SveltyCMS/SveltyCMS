/**
 * @file tests/e2e/collection-builder.spec.ts
 * @description E2E tests for the Collection Builder page.
 * Uses role/testid selectors only — no CSS classes, no text-content selectors.
 * Tests are intentionally scoped to navigation and page-load assertions so they
 * remain stable while the UI migrates.
 */
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Collection Builder', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsAdmin(page);
	});

	test('collection builder page loads without error', async ({ page }) => {
		await page.goto('/config/collectionbuilder', { waitUntil: 'load' });
		await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
		// A heading must be visible — content is theme-agnostic
		await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
	});

	test('widget management page loads without error', async ({ page }) => {
		await page.goto('/config/widgetManagement', { waitUntil: 'load' });
		await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
		await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
	});

	test('create-collection button or link is present', async ({ page }) => {
		await page.goto('/config/collectionbuilder', { waitUntil: 'load' });

		// Accept any button/link that suggests creating a new collection
		// The app uses "Add Collection" (i18n: collection_add)
		const trigger = page
			.getByTestId('create-collection')
			.or(page.getByRole('button', { name: /add.*collection/i }))
			.or(page.getByRole('button', { name: /add.*category/i }))
			.or(page.getByRole('button', { name: /create/i }))
			.or(page.getByRole('link', { name: /create/i }))
			.or(page.getByRole('button', { name: /new/i }))
			.or(page.getByRole('button', { name: /add/i }))
			.first();

		await expect(trigger).toBeVisible({ timeout: 10_000 });
	});

	test('collection builder is accessible after navigation', async ({ page }) => {
		// Navigate away then back — confirms no broken state
		await page.goto('/config/systemsetting', { waitUntil: 'load' });
		await page.goto('/config/collectionbuilder', { waitUntil: 'load' });
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
	});
});
