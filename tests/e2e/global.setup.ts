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

import { mkdirSync, existsSync, writeFileSync, unlinkSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export default async function globalSetup() {
  console.log("[Global Setup] Starting...");

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
  const isCI = process.env.CI === "true";
  const skipCleanup = process.env.SKIP_TEST_CLEANUP === "true";

  if (skipCleanup) {
    console.log("[Global Setup] Cleanup skipped (SKIP_TEST_CLEANUP=true)");
  } else {
    console.log("[Global Setup] Cleaning old test data...");

    const cleanupPaths = [
      // Database files (may be locked by webServer)
      join(process.cwd(), "config", "database", "sveltycms_test.sqlite"),
      join(process.cwd(), "config", "database", "sveltycms_test.sqlite-shm"),
      join(process.cwd(), "config", "database", "sveltycms_test.sqlite-wal"),
      join(process.cwd(), "config", "database", "svelty_setup_test.sqlite"),
      join(process.cwd(), "config", "database", "svelty_setup_test.sqlite-shm"),
      join(process.cwd(), "config", "database", "svelty_setup_test.sqlite-wal"),
      join(process.cwd(), "config", "database", "SveltyCMS_test.db.sqlite"),
      join(process.cwd(), "config", "database", "SveltyCMS_test.db.sqlite-shm"),
      join(process.cwd(), "config", "database", "SveltyCMS_test.db.sqlite-wal"),
      // Config files (critical - forces setup wizard)
      // ONLY delete in non-CI or if we specifically want a fresh start
      ...(!isCI
        ? [
            join(process.cwd(), "config", "private.test.ts"),
            join(process.cwd(), "config", "private.test.js"),
          ]
        : []),
    ];

    let deletedCount = 0;
    for (const path of cleanupPaths) {
      if (existsSync(path)) {
        try {
          unlinkSync(path);
          console.log(`[Global Setup] ✓ Deleted: ${path}`);
          deletedCount++;
        } catch (err: any) {
          // Ignore EBUSY errors (file locked by webServer)
          if (err.code !== "EBUSY") {
            console.warn(`[Global Setup] ⚠️ Failed to delete ${path}: ${err.code}`);
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
    { dir: join(process.cwd(), "mediaFolder"), content: "# Test media directory" },
  ];

  for (const { dir, content } of gitkeepMapping) {
    const gitkeepPath = join(dir, ".gitkeep");
    if (!existsSync(gitkeepPath)) {
      console.log(`[Global Setup] Creating .gitkeep in: ${dir}`);
      writeFileSync(gitkeepPath, content);
    }
  }

  console.log("[Global Setup] All required directories verified ✓");
}
