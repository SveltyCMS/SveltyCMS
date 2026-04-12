/**
 * @file tests/e2e/global.setup.ts
 * @description Global setup for Playwright E2E tests.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function globalSetup() {
  const authDir = join(process.cwd(), "tests/e2e/.auth");
  if (!existsSync(authDir)) {
    mkdirSync(authDir, { recursive: true });
  }

  // Ensure test-secret.txt exists for all workers
  const secretPath = join(authDir, "test-secret.txt");
  if (!existsSync(secretPath) && !process.env.TEST_API_SECRET) {
    const defaultSecret = `SVELTYCMS_TEST_SECRET_${Date.now()}`;
    process.env.TEST_API_SECRET = defaultSecret;
    writeFileSync(secretPath, defaultSecret);
    console.log(`[Global Setup] Created new test secret in ${secretPath}`);
  }

  // Clean up any stale worker databases
  if (existsSync(join(process.cwd(), "tests/e2e/db"))) {
    // Optional: cleanup db folder if needed
  }
}

export default globalSetup;
