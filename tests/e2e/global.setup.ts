/**
 * @file tests/e2e/global.setup.ts
 * @description Global setup for Playwright E2E tests
 *
 * Ensures clean state and required directories before tests run.
 * Critical for CI environments where gitignored folders don't exist.
 *
 * Cleanup strategy:
 * - LOCAL: Clean DB files if not locked, always clean config
 * - CI: Skip if fresh runner, clean if cached
 */

import { mkdirSync, existsSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export default async function globalSetup() {
  console.log("[Global Setup] Starting...");

  // Log test environment configuration for debugging
  console.log(
    "[Global Setup] Environment (test process only; server has its own via webServer.env):",
    {
      DB_TYPE: process.env.DB_TYPE,
      CI: !!process.env.CI,
    },
  );

  const authDir = join(process.cwd(), "tests/e2e/.auth");
  if (!existsSync(authDir)) {
    mkdirSync(authDir, { recursive: true });
  }

  // STEP 1: Ensure test-secret.txt exists for all workers (Synchronized across processes)
  const secretPath = join(authDir, "test-secret.txt");
  if (!existsSync(secretPath) && !process.env.TEST_API_SECRET) {
    const defaultSecret = `SVELTYCMS_TEST_SECRET_${Date.now()}_${randomUUID().slice(0, 8)}`;
    process.env.TEST_API_SECRET = defaultSecret;
    writeFileSync(secretPath, defaultSecret);
    console.log(`[Global Setup] ✓ Created new test secret in ${secretPath}`);
  }

  // STEP 2: Clean up old test data (unless skipped)
  const skipCleanup = process.env.SKIP_TEST_CLEANUP === "true";

  if (skipCleanup) {
    console.log("[Global Setup] Cleanup skipped (SKIP_TEST_CLEANUP=true)");
  } else {
    console.log("[Global Setup] Cleaning old test data...");

    // Clean stale collection artifacts from previous test runs
    const cleanupPaths: string[] = [
      // Collection source files — test artifacts that accumulate over runs
      join(process.cwd(), "config", "collections"),
      // Compiled collection JS files — regenerated from sources
      join(process.cwd(), ".compiledCollections"),
    ];

    let deletedCount = 0;
    for (const cleanupPath of cleanupPaths) {
      if (existsSync(cleanupPath)) {
        try {
          rmSync(cleanupPath, { recursive: true, force: true });
          // Re-create directory if it was a directory (so downstream code can write into it)
          mkdirSync(cleanupPath, { recursive: true });
          console.log(`[Global Setup] ✓ Deleted: ${cleanupPath}`);
          deletedCount++;
        } catch (err: any) {
          // Ignore EBUSY errors (file locked by webServer)
          if (err.code !== "EBUSY") {
            console.warn(`[Global Setup] ⚠️ Failed to delete ${cleanupPath}: ${err.code}`);
          }
        }
      }
    }

    // Clean media folder (keep directory but remove files)
    const mediaFolder = join(process.cwd(), "mediaFolder");
    if (existsSync(mediaFolder)) {
      try {
        const files = readdirSync(mediaFolder);
        for (const file of files) {
          if (file !== ".gitkeep") {
            const filePath = join(mediaFolder, file);
            rmSync(filePath, { recursive: true, force: true });
            console.log(`[Global Setup] ✓ Deleted media: ${file}`);
            deletedCount++;
          }
        }
      } catch (err: any) {
        console.warn(`[Global Setup] ⚠️ Failed to clean mediaFolder: ${err.message}`);
      }
    }

    console.log(`[Global Setup] Cleanup completed (${deletedCount} items removed)`);
  }

  // STEP 3: Ensure required directories exist
  const requiredDirs = [
    join(process.cwd(), "config", "database"),
    join(process.cwd(), "tests", "e2e", ".auth"),
    join(process.cwd(), "logs"),
    join(process.cwd(), "mediaFolder"),
  ];

  for (const dir of requiredDirs) {
    if (!existsSync(dir)) {
      console.log(`[Global Setup] Creating directory: ${dir}`);
      mkdirSync(dir, { recursive: true });

      // Verify directory was actually created
      if (!existsSync(dir)) {
        throw new Error(`Failed to create required directory: ${dir}`);
      }
    } else {
      console.log(`[Global Setup] Directory already exists: ${dir}`);
    }
  }

  // Create .gitkeep files to ensure directories are tracked
  const gitkeepMapping = [
    {
      dir: join(process.cwd(), "config", "database"),
      content: "# Database files directory for tests",
    },
    { dir: join(process.cwd(), "logs"), content: "# Test logs directory" },
    {
      dir: join(process.cwd(), "mediaFolder"),
      content: "# Test media directory",
    },
  ];

  for (const { dir, content } of gitkeepMapping) {
    const gitkeepPath = join(dir, ".gitkeep");
    if (!existsSync(gitkeepPath)) {
      console.log(`[Global Setup] Creating .gitkeep in: ${dir}`);
      writeFileSync(gitkeepPath, content);
    }
  }

  // STEP 4: Set required environment variables for test processes
  // These ensure the test environment has consistent configuration
  // even when not all variables are defined in CI or local .env files
  const requiredEnvVars: Record<string, string> = {
    JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || "e2e-test-jwt-secret-key-min-32-chars!!",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "e2e-test-encryption-key-min-32-chars!!",
    USE_GOOGLE_OAUTH: process.env.USE_GOOGLE_OAUTH || "true",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "e2e-test-google-client-id",
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "e2e-test-github-client-id",
    DB_HOST: process.env.DB_HOST || "localhost",
    DB_NAME: process.env.DB_NAME || "sveltycms_e2e_ready.db",
  };

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!process.env[key]) {
      process.env[key] = value;
      console.log(`[Global Setup] ✓ Set default ${key} for test environment`);
    }
  }

  console.log("[Global Setup] All required directories verified ✓");
  console.log("[Global Setup] Complete");
}
