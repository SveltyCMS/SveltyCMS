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

// Ensure workers inherit the secret so they can authenticate testing endpoints
process.env.TEST_API_SECRET = TEST_API_SECRET;

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
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173",

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
      testMatch: /routes\/setup\/setup-wizard\.spec\.ts/,
      // Force sequential to avoid race conditions during database provisioning
      workers: 1,
    },
    {
      name: "auth-setup",
      testMatch: [/auth\.setup\.ts/, /routes\/login\/login\.spec\.ts/],
      // No dependency on "wizard": in CI the wizard runs once in its own job.
      // In local dev, run `playwright test --project=wizard` first manually if needed.
      // Force sequential to avoid race conditions during auth bootstrapping
      workers: 1,
    },
    {
      name: "signup",
      testMatch: [/routes\/user\/account-smoke\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "content",
      testMatch: [/routes\/collection-builder\/content-smoke\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "system",
      testMatch: [/routes\/system\/settings\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "a11y",
      testMatch: /routes\/login\/accessibility\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "rbac",
      testMatch: /routes\/system\/rbac\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "language",
      testMatch: /routes\/system\/language\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "users",
      testMatch: [/routes\/user\/profile\.spec\.ts$/, /routes\/user\/management\.spec\.ts$/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "builder",
      testMatch: [
        /routes\/collection-builder\/builder\.spec\.ts/,
        /routes\/collection-builder\/collection\.spec\.ts/,
        /routes\/collection-builder\/journey\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "permissions",
      testMatch: /routes\/system\/permissions\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "firstuser",
      testMatch: [/routes\/login\/signup\.spec\.ts$/, /routes\/login\/oauth\.spec\.ts$/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      // No dependency on auth-setup — these hit login/signup pages directly
      workers: 1,
    },
  ],

  /* Run preview server before starting the tests (local dev only; CI starts the server manually) */
  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: `cross-env TEST_MODE=true STRICT_SETUP_CHECK=true TEST_API_SECRET=${TEST_API_SECRET} node build/index.js`,
          port: 4173,
          timeout: 300_000,
          reuseExistingServer: true,
          env: {
            HOST: "127.0.0.1",
            PORT: "4173",
          },
        },
      }),
});
