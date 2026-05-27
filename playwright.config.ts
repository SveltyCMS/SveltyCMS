/**
 * @file playwright.config.ts
 * @description Playwright test configuration for SveltyCMS
 *
 * Project dependency chain enforces execution order:
 *   setup (wizard) → authenticated (most tests) → teardown
 *
 * This guarantees the database is initialized before any logged-in test runs.
 * TEST_MODE=true makes the server use config/private.test.ts, never config/private.ts.
 */

import { defineConfig, devices } from '@playwright/test';

declare const process: {
	env: {
		CI?: string;
		PLAYWRIGHT_TEST_BASE_URL?: string;
	};
};

const isCI = !!process.env.CI;
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || (isCI ? 'http://localhost:4173' : 'http://localhost:5173');

// Shared browser config for local vs CI
const localChrome = {
	...devices['Desktop Chrome'],
	channel: 'chrome', // use system Chrome — no separate download needed
	headless: true
};
const ciChrome = {
	...devices['Desktop Chrome'],
	headless: true
};
const browserUse = isCI ? ciChrome : localChrome;

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.spec.ts',

	fullyParallel: false,
	workers: 1,
	forbidOnly: isCI,
	retries: isCI ? 1 : 0,

	// Reports and artifacts live under tests/ so they never clutter the project root
	outputDir: 'tests/test-results',
	reporter: [['html', { outputFolder: 'tests/playwright-report' }], [isCI ? 'github' : 'list']],

	use: {
		baseURL,
		trace: 'on-first-retry',
		video: 'off',
		screenshot: 'only-on-failure',
		bypassCSP: true,
		actionTimeout: 15_000,
		navigationTimeout: 30_000
	},

	projects: [
		// ── 1. SETUP: initialise the DB via API (no wizard UI needed) ──────────
		// The wizard UI tests are held until the Svelte remote-function conversion.
		{
			name: 'setup',
			use: browserUse,
			testMatch: ['**/global.setup.ts']
		},

		// ── 2. AUTH: login / logout / signup flows ──────────────────────────────
		// (waiting for Svelte remote-function conversion — kept here so the
		//  dependency chain is declared; currently these files are unchanged)
		{
			name: 'auth',
			use: browserUse,
			testMatch: ['**/login.spec.ts', '**/signupfirstuser.spec.ts'],
			dependencies: ['setup']
		},

		// ── 3. OAUTH: OAuth callback tests (independent of auth UI) ─────────────
		{
			name: 'oauth',
			use: browserUse,
			testMatch: ['**/oauth-signup-firstuser.spec.ts'],
			dependencies: ['setup']
		},

		// ── 4. AUTHENTICATED: all tests that need a logged-in admin ─────────────
		{
			name: 'authenticated',
			use: browserUse,
			testMatch: [
				'**/collection-builder.spec.ts',
				'**/collection.spec.ts',
				'**/language.spec.ts',
				'**/role-based-access.spec.ts',
				'**/permission-change.spec.ts',
				'**/user-crud.spec.ts',
				'**/user.spec.ts'
			],
			dependencies: ['setup']
		},

		// ── 5. TEARDOWN: clean up auth state ────────────────────────────────────
		{
			name: 'teardown',
			use: browserUse,
			testMatch: ['**/global.teardown.ts'],
			dependencies: ['authenticated', 'auth', 'oauth']
		}
	],

	// Only auto-start the dev server locally; CI manages it in the workflow
	...(isCI
		? {}
		: {
				webServer: {
					command: 'bun.cmd dev --port 5173',
					url: 'http://localhost:5173',
					timeout: 90_000,
					reuseExistingServer: true,
					env: { TEST_MODE: 'true' },
					stdout: 'ignore',
					stderr: 'pipe'
				}
			})
});
