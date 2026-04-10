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

export default async function globalSetup() {
  console.log("[Global Setup] Starting...");
  
  // Skip cleanup if explicitly requested (debugging)
  if (process.env.SKIP_TEST_CLEANUP === "true") {
    console.log("[Global Setup] Cleanup skipped (SKIP_TEST_CLEANUP=true)");
  } else {
    // STEP 1: Clean up old test data
    console.log("[Global Setup] Cleaning old test data...");
    
    const cleanupPaths = [
      // Database files (may be locked by webServer)
      join(process.cwd(), "config", "database", "SveltyCMS_test.db.sqlite"),
      join(process.cwd(), "config", "database", "SveltyCMS_test.db.sqlite-shm"),
      join(process.cwd(), "config", "database", "SveltyCMS_test.db.sqlite-wal"),
      join(process.cwd(), "config", "database", "SveltyCMS.db.sqlite"),
      join(process.cwd(), "config", "database", "SveltyCMS.db.sqlite-shm"),
      join(process.cwd(), "config", "database", "SveltyCMS.db.sqlite-wal"),
      // Config files (critical - forces setup wizard)
      join(process.cwd(), "config", "private.ts"),
      join(process.cwd(), "config", "private.js"),
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
          if (err.code !== 'EBUSY') {
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
  
  // STEP 2: Ensure required directories exist
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
    { dir: join(process.cwd(), "config", "database"), content: "# Database files directory for tests" },
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
