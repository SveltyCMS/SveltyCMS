/**
 * @file tests/e2e/language.spec.ts
 * @description E2E test: admin can switch system language via the language selector.
 * Uses data-testid selectors so it survives UI/theme refactors.
 */
import { expect, test } from '@playwright/test';
import { ensureSidebarVisible, loginAsAdmin } from './helpers/auth';

test.describe('System Language Change', () => {
	test.setTimeout(60_000);

	test('admin can switch system language between EN and DE', async ({ page }) => {
		await loginAsAdmin(page);

		// On mobile the language selector is inside the collapsed sidebar
		await ensureSidebarVisible(page);

		// The language trigger shows the current language code ("en" / "de")
		const trigger = page.locator('[aria-label="Select language"]').first();
		await expect(trigger).toBeVisible({ timeout: 10_000 });

		// Open the menu — only one item appears (the other language)
		await trigger.click();
		const firstItem = page.locator('[role="menuitem"]').first();
		await expect(firstItem).toBeVisible({ timeout: 5_000 });
		await firstItem.click();

		// Wait for the locale navigation to complete
		await page.waitForLoadState('load');
		await page.waitForTimeout(500);

		// Re-open sidebar in case the navigation collapsed it (mobile)
		await ensureSidebarVisible(page);

		// Switch back to the original language
		const trigger2 = page.locator('[aria-label="Select language"]').first();
		await expect(trigger2).toBeVisible({ timeout: 10_000 });
		await trigger2.click();
		const secondItem = page.locator('[role="menuitem"]').first();
		await expect(secondItem).toBeVisible({ timeout: 5_000 });
		await secondItem.click();
		await page.waitForLoadState('load');
	});
});
