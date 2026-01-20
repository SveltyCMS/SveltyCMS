/**
 * @file playwright.config.ts
 * @description Playwright test configuration for SveltyCMS
 */

import { defineConfig, devices } from '@playwright/test';

// Detect if we should run headless (CI, no display, or explicit flag)
const shouldRunHeadless = !!process.env.CI || !process.env.DISPLAY || process.env.HEADLESS === 'true';

// See https://playwright.dev/docs/test-configuration.
export default defineConfig({
	testDir: './tests/playwright',
	testMatch: '**/*.{test,spec,spect}.ts',

	/* Global setup: Clean state, seed users, save auth states */
	globalSetup: require.resolve('./tests/playwright/global-setup.ts'),

	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,

	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: [
		['list'], // Console output
		['html', { open: 'never' }], // HTML report (open manually)
		...(process.env.CI ? [['github'] as const] : []) // GitHub annotations in CI
	],

	/* Global timeout settings */
	timeout: 60000, // 60 seconds per test
	expect: {
		timeout: 10000 // 10 seconds for expect assertions
	},

	/* Set environment variables for tests */
	use: {
		/* Base URL to use in actions like `await page.goto('/')`. */
		baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || (process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173'),

		launchOptions: {
			slowMo: parseInt(process.env.SLOW_MO || '0'),
			devtools: !process.env.CI // Enable devtools when not in CI
		},

		/* ========== DEBUG ON FAILURE ========== */
		/* Trace: Full timeline of actions, network, DOM snapshots */
		trace: 'retain-on-failure', // Keep trace only when test fails

		/* Video: Record browser video */
		video: 'retain-on-failure', // Keep video only when test fails

		/* Screenshot: Capture final state */
		screenshot: 'only-on-failure', // Screenshot on failure

		/* Action timeout */
		actionTimeout: 15000, // 15 seconds for clicks, fills, etc.

		/* Navigation timeout */
		navigationTimeout: 30000, // 30 seconds for page loads

		/* Bypass CSP in tests to allow MongoDB connections */
		bypassCSP: true
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				headless: shouldRunHeadless // Always headless in CI
			}
		},

		{
			name: 'firefox',
			use: {
				...devices['Desktop Firefox'],
				headless: shouldRunHeadless
			}
		},

		{
			name: 'webkit',
			use: {
				...devices['Desktop Safari'],
				headless: shouldRunHeadless
			}
		},

		/* Test against mobile viewports. */
		{
			name: 'Mobile Chrome',
			use: {
				...devices['Pixel 5'],
				headless: shouldRunHeadless
			}
		},
		{
			name: 'Mobile Safari',
			use: {
				...devices['iPhone 12'],
				headless: shouldRunHeadless
			}
		},

		/* Test against branded browsers. */
		{
			name: 'Microsoft Edge',
			use: {
				...devices['Desktop Edge'],
				channel: 'msedge',
				headless: shouldRunHeadless
			}
		},
		{
			name: 'Google Chrome',
			use: {
				...devices['Desktop Chrome'],
				channel: 'chrome',
				headless: shouldRunHeadless
			}
		}
	],

	/* Run your local dev server before starting the tests */
	// In CI, the workflow starts the server manually, so we only use webServer locally
	...(process.env.CI
		? {}
		: {
				webServer: {
					command: 'bun install && bun dev --port 5173',
					port: 5173,
					timeout: 60000, // Increased timeout to 1 minute
					reuseExistingServer: true,
					env: {
						PLAYWRIGHT_TEST: 'true'
					}
				}
			})
});
