import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './tests/playwright',
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
		baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',

		launchOptions: {
			slowMo: parseInt(process.env.SLOW_MO || '0'),
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
			use: { ...devices['Desktop Chrome'], headless: false }
		},

		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		},

		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] }
		},

		/* Test against mobile viewports. */
		{
			name: 'Mobile Chrome',
			use: { ...devices['Pixel 5'] }
		},
		{
			name: 'Mobile Safari',
			use: { ...devices['iPhone 12'] }
		},

		/* Test against branded browsers. */
		{
			name: 'Microsoft Edge',
			use: { ...devices['Desktop Edge'], channel: 'msedge' }
		},
		{
			name: 'Google Chrome',
			use: { ...devices['Desktop Chrome'], channel: 'chrome' }
		}
	],

	/* Run your local dev server before starting the tests */
	webServer: {
		command: 'bun install && bun dev --port 5173',
		port: 5173,
		timeout: 60000, // Increased timeout to 1 minute
		reuseExistingServer: true,
		env: {
			PLAYWRIGHT_TEST: 'true'
		}
	}
});
