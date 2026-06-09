/**
 * @file playwright.config.ts
 * @description Playwright test configuration for SveltyCMS
 */

import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Ensure .auth directory exists for secret sync
const authDir = join(process.cwd(), "tests/e2e/.auth");
if (!existsSync(authDir)) {
  mkdirSync(authDir, { recursive: true });
}

// Share one test secret across all Playwright workers for explicit /api/testing calls.
const SECRET_FILE = join(authDir, "test-secret.txt");
let TEST_API_SECRET = process.env.TEST_API_SECRET;

if (!TEST_API_SECRET) {
  if (existsSync(SECRET_FILE)) {
    TEST_API_SECRET = readFileSync(SECRET_FILE, "utf-8").trim();
  } else {
    TEST_API_SECRET = randomUUID();
    writeFileSync(SECRET_FILE, TEST_API_SECRET);
  }
}

// See https://playwright.dev/docs/test-configuration.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.{test,spec,spect}.ts",
  /* Maximum time one test can run for. */
  // timeout: 60 * 1000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toBeVisible();`
     */
    timeout: 10 * 1000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /*
   * ✨ Database-per-Worker Strategy:
   * Enable parallelism. Each worker will use a unique SQLite file
   * (e.g. cms_worker1.db) triggered by the x-test-worker-index header.
   */
  workers: process.env.CI ? 4 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["html", { outputFolder: "tests/playwright-report", open: "never" }],
    [process.env.CI ? "github" : "list"],
  ],

  /* Set environment variables for tests */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:5173",

    /* Tag Playwright-originated API calls without bypassing normal browser navigation. */
    extraHTTPHeaders: {
      "x-test-mode": "true",
    },

    launchOptions: {
      slowMo: Number.parseInt(process.env.SLOW_MO || "0", 10),
    },
    // Explicitly set PWDEBUG for local runs
    // Set environment variables in your test runner or webServer configuration if needed

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    video: "retain-on-failure",

    /* Bypass CSP in tests to allow MongoDB connections */
    bypassCSP: true,
  },

  /* Global Setup for artifact/secret synchronization */
  globalSetup: "./tests/e2e/global.setup.ts",

  /* Configure projects for staged CI Matrix */
  projects: [
    {
      name: "wizard",
      testMatch: /setup-wizard.*\.spec\.ts/,
      // Force sequential to avoid race conditions during database provisioning
      workers: 1,
    },
    {
      name: "auth-setup",
      testMatch: [/auth\.setup\.ts/, /login\.spec\.ts/],
      // No dependency on "wizard": in CI the wizard runs once in its own job.
      // In local dev, run `playwright test --project=wizard` first manually if needed.
      // Force sequential to avoid race conditions during auth bootstrapping
      workers: 1,
    },
    {
      name: "signup",
      testMatch: [/account-smoke\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "content",
      testMatch: [/content-smoke\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "system",
      testMatch: [/system-smoke\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
  ],

  /* Run preview server before starting the tests (local dev only; CI starts the server manually) */
  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: `cross-env TEST_MODE=true STRICT_SETUP_CHECK=true TEST_API_SECRET=${TEST_API_SECRET} bun run dev`,
          port: 5173,
          timeout: 300_000,
          reuseExistingServer: true,
        },
      }),
});
