/**
 * @file tests/playwright/fixtures/auth.fixtures.ts
 * @description Playwright fixtures for role-based authenticated testing
 *
 * Usage:
 *   import { test } from './fixtures/auth.fixtures';
 *   test('admin can access settings', async ({ adminPage }) => { ... });
 *   test('editor can only access content', async ({ editorPage }) => { ... });
 */

import { test as base, type Page, type BrowserContext } from '@playwright/test';
import * as path from 'path';

// Paths to saved auth states (created by global-setup.ts)
const AUTH_DIR = path.join(__dirname, '../.auth');

type RoleFixtures = {
	adminContext: BrowserContext;
	adminPage: Page;
	devContext: BrowserContext;
	devPage: Page;
	editorContext: BrowserContext;
	editorPage: Page;
	viewerContext: BrowserContext;
	viewerPage: Page;
};

/**
 * Extended test with role-based authenticated pages
 */
export const test = base.extend<RoleFixtures>({
	// Admin fixtures
	adminContext: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: path.join(AUTH_DIR, 'admin.json')
		});
		await use(context);
		await context.close();
	},
	adminPage: async ({ adminContext }, use) => {
		const page = await adminContext.newPage();
		await use(page);
	},

	// Dev fixtures
	devContext: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: path.join(AUTH_DIR, 'dev.json')
		});
		await use(context);
		await context.close();
	},
	devPage: async ({ devContext }, use) => {
		const page = await devContext.newPage();
		await use(page);
	},

	// Editor fixtures
	editorContext: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: path.join(AUTH_DIR, 'editor.json')
		});
		await use(context);
		await context.close();
	},
	editorPage: async ({ editorContext }, use) => {
		const page = await editorContext.newPage();
		await use(page);
	},

	// Viewer fixtures
	viewerContext: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: path.join(AUTH_DIR, 'viewer.json')
		});
		await use(context);
		await context.close();
	},
	viewerPage: async ({ viewerContext }, use) => {
		const page = await viewerContext.newPage();
		await use(page);
	}
});

export { expect } from '@playwright/test';

/**
 * Test credentials (for manual login if needed)
 */
export const TEST_USERS = {
	admin: { email: 'admin@example.com', password: 'Admin123!' },
	dev: { email: 'dev@example.com', password: 'DevPassword123!' },
	editor: { email: 'editor@example.com', password: 'EditorPassword123!' },
	viewer: { email: 'viewer@example.com', password: 'ViewerPassword123!' }
} as const;
