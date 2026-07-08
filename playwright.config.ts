/**
 * @file playwright.config.ts
 * @description Playwright test configuration for SveltyCMS
 *
 * Dual-server architecture:
 * - READY server (port 4173): Pre-configured DB for auth-setup, login, firstuser, and all downstream tests
 * - SETUP server (port 4174): Clean-slate for setup-wizard tests
 *
 * Projects using the SETUP server override baseURL to port 4174.
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
  // Local E2E uses one shared ready server/database. Keep local full-suite runs
  // serial so reset-heavy specs do not wipe state from other workers.
  workers: process.env.CI ? 4 : 1,
  reporter: [
    ["html", { outputFolder: "tests/playwright-report", open: "never" }],
    [process.env.CI ? "github" : "list"],
  ],

  use: {
    // Default: READY server. Wizard project overrides this.
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173",
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
    // ── SETUP-STATE projects (port 4174) ──
    {
      name: "wizard",
      use: {
        baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4174",
      },
      testMatch: "routes/setup/setup-wizard.spec.ts",
      workers: 1,
    },

    // ── READY-STATE projects (port 4173) ──
    // firstuser must run before auth-setup so signup works on a userless system
    {
      name: "firstuser",
      testMatch: ["**/login/signup.spec.ts", "**/login/oauth.spec.ts"],
      workers: 1,
    },
    {
      name: "auth-setup",
      testMatch: [/auth\.setup\.ts/, /routes\/login\/login\.spec\.ts/],
      dependencies: ["firstuser"],
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
      testMatch: [
        /routes\/system\/settings\.spec\.ts/,
        /routes\/config\/access-management\.spec\.ts/,
        /routes\/config\/webhooks\.spec\.ts/,
        /routes\/config\/automations\.spec\.ts/,
        /routes\/config\/data-management\.spec\.ts/,
        /routes\/config\/operations\.spec\.ts/,
        /routes\/admin\/tenants\.spec\.ts/,
      ],
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
      name: "branding",
      testMatch: /routes\/login\/branding\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ["auth-setup"],
      workers: 1,
    },
    {
      name: "visual-regression",
      testMatch: /routes\/admin-theme\/visual-regression\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ["auth-setup"],
      workers: 1,
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
      testMatch: ["**/user/profile.spec.ts", "**/user/management.spec.ts"],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "builder",
      testMatch: [
        "**/collection-builder/builder.spec.ts",
        "**/collection-builder/collection.spec.ts",
        "**/collection-builder/journey.spec.ts",
        "**/collection-builder/empty-state.spec.ts",
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
      name: "config-routes",
      testMatch: [
        "**/routes/config/access-management.spec.ts",
        "**/routes/config/webhooks.spec.ts",
        "**/routes/config/automations.spec.ts",
        "**/routes/config/data-management.spec.ts",
        "**/routes/config/operations.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "admin",
      testMatch: "**/routes/admin/tenants.spec.ts",
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "dashboard",
      testMatch: "**/routes/dashboard/dashboard.spec.ts",
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "appearance",
      testMatch: ["**/routes/config/appearance.spec.ts", "**/routes/config/design-system.spec.ts"],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "media",
      testMatch: [
        "**/routes/mediagallery/mediagallery.spec.ts",
        "**/routes/mediagallery/image-editor.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: ["auth-setup"],
    },
    {
      name: "chromium",
      // Catch-all project for CI sharded matrix.
      // Wizard + auth-setup run sequentially in e2e-prep; all remaining
      // tests are sharded here across parallel CI jobs.
      testIgnore: ["**/setup/setup-wizard.spec.ts", "**/auth.setup.ts", "**/login/login.spec.ts"],
      use: { ...devices["Desktop Chrome"], headless: !!process.env.CI },
      dependencies: process.env.SKIP_E2E_DEPS === "true" ? [] : ["auth-setup"],
    },
  ],

  /* Run preview servers before starting the tests (local dev only; CI starts servers manually) */
  ...(process.env.CI
    ? {}
    : {
        webServer: [
          {
            // READY server — pre-configured DB for login/firstuser/downstream tests
            command: `npx cross-env PORT=4173 SERVER=ready TEST_API_SECRET=${TEST_API_SECRET} node tests/e2e/start-server.mjs`,
            port: 4173,
            timeout: 300_000,
            reuseExistingServer: false,
          },
          {
            // SETUP server — clean slate for setup-wizard tests
            command: `npx cross-env PORT=4174 SERVER=setup TEST_API_SECRET=${TEST_API_SECRET} node tests/e2e/start-server.mjs`,
            port: 4174,
            timeout: 300_000,
            reuseExistingServer: true,
          },
        ],
      }),
});
