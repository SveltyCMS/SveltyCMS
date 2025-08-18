import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. You can enable HTML if needed */
  // reporter: 'html',

  use: {
    /* Base URL comes from workflow or local fallback */
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173',

    launchOptions: {
      slowMo: parseInt(process.env.SLOW_MO || '0')
    },

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    video: 'retain-on-failure'
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },

    // Mobile
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },

    // Branded browsers
    { name: 'Microsoft Edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'Google Chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }
  ]

  // 🚨 Removed webServer block — server is managed by GitHub Actions workflow
})
