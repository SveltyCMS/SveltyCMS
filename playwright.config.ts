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

// ✨ Synchronization: Use a file to share the secret across all Playwright workers
// This prevents 403 errors when workers re-evaluate the config file.
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
  reporter: [["html"], [process.env.CI ? "github" : "list"]],

  /* Set environment variables for tests */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173",

    /* ✨ ISOLATION: Pass worker index and secure token to the server */
    extraHTTPHeaders: {
      "x-test-worker-index": process.env.TEST_WORKER_INDEX || "0",
      "x-test-secret": TEST_API_SECRET,
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
      testMatch: [
        /signupfirstuser\.spec\.ts/,
        /oauth-signup-firstuser\.spec\.ts/,
        /role-based-access\.spec\.ts/,
        /permission-change\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "content",
      testMatch: [/collection\.spec\.ts/, /collection-builder\.spec\.ts/, /user-crud\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "system",
      testMatch: [/language\.spec\.ts/, /user\.spec\.ts/, /setup-wizard-errors\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
  ],

  /* Run preview server before starting the tests (local dev only; CI starts the server manually) */
  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: `TEST_API_SECRET=${TEST_API_SECRET} bun run preview`,
          port: 4173,
          timeout: 300_000,
          reuseExistingServer: true,
        },
      }),
});
