/**
 * @file playwright.config.ts
 * @description Playwright test configuration for SveltyCMS
 */

import { defineConfig, devices } from '@playwright/test';

// See https://playwright.dev/docs/test-configuration.
export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.{test,spec,spect}.ts',
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	//reporter: 'html',

	/* Set environment variables for tests */
	use: {
		/* Base URL to use in actions like `await page.goto('/')`. */
		baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || (process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173'),

		launchOptions: {
			slowMo: Number.parseInt(process.env.SLOW_MO || '0', 10),
			devtools: !process.env.CI // Enable devtools when not in CI
		},
		// Explicitly set PWDEBUG for local runs
		// Set environment variables in your test runner or webServer configuration if needed

		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',
		video: 'retain-on-failure',

		/* Bypass CSP in tests to allow MongoDB connections */
		bypassCSP: true
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				headless: !!process.env.CI // Always headless in CI
			}
		},

		{
			name: 'firefox',
			use: {
				...devices['Desktop Firefox'],
				headless: !!process.env.CI
			}
		},

		{
			name: 'webkit',
			use: {
				...devices['Desktop Safari'],
				headless: !!process.env.CI
			}
		},

		/* Test against mobile viewports. */
		{
			name: 'Mobile Chrome',
			use: {
				...devices['Pixel 5'],
				headless: !!process.env.CI
			}
		},
		{
			name: 'Mobile Safari',
			use: {
				...devices['iPhone 12'],
				headless: !!process.env.CI
			}
		},

		/* Test against branded browsers. */
		{
			name: 'Microsoft Edge',
			use: {
				...devices['Desktop Edge'],
				channel: 'msedge',
				headless: !!process.env.CI
			}
		},
		{
			name: 'Google Chrome',
			use: {
				...devices['Desktop Chrome'],
				channel: 'chrome',
				headless: !!process.env.CI
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
					timeout: 60_000, // Increased timeout to 1 minute
					reuseExistingServer: true,
					env: {
						PLAYWRIGHT_TEST: 'true'
					}
				}
			})
});
