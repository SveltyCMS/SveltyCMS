/**
 * @file tests/playwright/helpers/isolation.ts
 * @description Test isolation utilities to ensure tests don't interfere with each other
 */

import type { Page } from '@playwright/test';

/**
 * Clean up browser state between tests
 * Call this in test.beforeEach() to ensure proper test isolation
 */
export async function cleanupBrowserState(page: Page): Promise<void> {
	// Clear cookies
	await page.context().clearCookies();

	// Clear localStorage and sessionStorage
	await page.evaluate(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	// Clear any service worker caches if present
	await page.evaluate(() => {
		if ('caches' in window) {
			caches.keys().then((names) => {
				names.forEach((name) => {
					caches.delete(name);
				});
			});
		}
	});
}

/**
 * Reset page to a known clean state
 * Useful for tests that need a completely fresh start
 */
export async function resetPageState(page: Page): Promise<void> {
	await cleanupBrowserState(page);
	
	// Navigate to about:blank to ensure no page state remains
	await page.goto('about:blank');
}

/**
 * Example usage in tests:
 * 
 * ```typescript
 * import { test } from '@playwright/test';
 * import { cleanupBrowserState } from './helpers/isolation';
 * 
 * test.beforeEach(async ({ page }) => {
 *   await cleanupBrowserState(page);
 * });
 * 
 * test('my test', async ({ page }) => {
 *   // Test runs with clean state
 * });
 * ```
 */
