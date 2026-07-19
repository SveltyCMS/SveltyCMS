/**
 * @file playwright.config.ts
 * @description Playwright test configuration for SveltyCMS
 *
 * Simplified 4-project architecture:
 * - wizard:     Setup wizard on clean slate (serial, port 5174 fallback)
 * - firstuser:  Signup + OAuth before auth seeding (serial)
 * - auth-setup: Seed users + login test + save auth state (serial)
 * - chromium:   All CMS routes — fully parallel, sharded in CI
 *
 * Projects run in dependency order. In CI, e2e-prep runs wizard →
 * firstuser → auth-setup sequentially, then chromium is sharded N ways.
 *
 * For local runs, use: npm run test:e2e
 * This starts the Vite dev server (port 5173) which includes the /api/testing
 * handler needed for test authentication. The production build strips this
 * handler for security — build with `npm run build:e2e` if you need it.
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

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.{test,spec,spect}.ts",
  outputDir: "./tests/test-results",
  timeout: 90_000,
  expect: {
    timeout: 10 * 1000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
      threshold: 0.25,
    },
  },
  snapshotPathTemplate: "{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [
        ["list"],
        ["github"], // inline annotations on the PR check
        ["html", { outputFolder: "tests/playwright-report", open: "never" }],
        // Machine-readable for scripts/ci-report-playwright.ts → GITHUB_STEP_SUMMARY
        ["json", { outputFile: "tests/playwright-results.json" }],
      ]
    : [["list"], ["html", { outputFolder: "tests/playwright-report", open: "never" }]],

  use: {
    // Default: Vite dev server (port 5173). CI sets PLAYWRIGHT_TEST_BASE_URL.
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:5173",
    extraHTTPHeaders: {
      "x-test-mode": "true",
      "x-test-worker-index": process.env.TEST_WORKER_INDEX || "0",
      "x-test-secret": TEST_API_SECRET || "",
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
      use: { baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:5173" },
      testMatch: "routes/setup/setup-wizard.spec.ts",
      workers: 1,
    },
    {
      name: "firstuser",
      testMatch: ["**/login/signup.spec.ts"],
      workers: 1,
    },
    // OAuth tests require a real IdP — run manually when configured
    // bun x playwright test tests/e2e/routes/login/oauth.spec.ts --project=firstuser
    {
      name: "oauth",
      testMatch: ["**/login/oauth.spec.ts"],
      workers: 1,
      // Only included in CI when OAUTH_ENABLED=true
      ...(process.env.CI === "true" && process.env.OAUTH_ENABLED !== "true"
        ? { testIgnore: ["**/*.spec.ts"] }
        : {}),
    },
    {
      name: "auth-setup",
      testMatch: [/auth\.setup\.ts/, /routes\/login\/login\.spec\.ts/],
      dependencies: ["firstuser"],
      workers: 1,
    },
    {
      name: "chromium",
      testIgnore: [
        "**/setup/setup-wizard.spec.ts",
        "**/auth.setup.ts",
        "**/routes/login/login.spec.ts",
        "**/routes/login/signup.spec.ts",
        "**/routes/login/oauth.spec.ts",
      ],
      use: {
        ...devices["Desktop Chrome"],
        headless: !!process.env.CI,
        ...(existsSync(join(authDir, "admin.json"))
          ? { storageState: join(authDir, "admin.json") }
          : {}),
      },
      dependencies: process.env.SKIP_E2E_DEPS === "true" ? [] : ["auth-setup"],
    },
  ],
});
