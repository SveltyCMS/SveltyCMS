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

// Synchronization: Use a file to share the secret across all Playwright workers.
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

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.{test,spec,spect}.ts",

  expect: {
    timeout: 10 * 1000,
  },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [["html"], [process.env.CI ? "github" : "list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173",

    extraHTTPHeaders: {
      "x-test-worker-index": process.env.TEST_WORKER_INDEX || "0",
      "x-test-secret": TEST_API_SECRET,
    },

    launchOptions: {
      slowMo: Number.parseInt(process.env.SLOW_MO || "0", 10),
    },

    trace: "on-first-retry",
    video: "retain-on-failure",
    bypassCSP: true,
  },

  globalSetup: "./tests/e2e/global.setup.ts",

  projects: [
    {
      name: "wizard",
      // CI wizard job should only run the stable full provisioning flow.
      // Do not include setup-wizard-full.spec.ts or setup-wizard-errors.spec.ts here.
      testMatch: /setup-wizard\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
    },
    {
      name: "auth-setup",
      testMatch: [/auth\.setup\.ts/, /login\.spec\.ts/],
      workers: 1,
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
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
      testMatch: [
        /collection\.spec\.ts/,
        /collection-builder\.spec\.ts/,
        /user-crud\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "system",
      // setup-wizard-errors.spec.ts is intentionally excluded from CI system tests.
      // It is unstable because it depends on setup wizard error UI behavior.
      testMatch: [/language\.spec\.ts/, /user\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
  ],

  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: `cross-env TEST_API_SECRET=${TEST_API_SECRET} bun run preview`,
          port: 4173,
          timeout: 300_000,
          reuseExistingServer: true,
        },
      }),
});