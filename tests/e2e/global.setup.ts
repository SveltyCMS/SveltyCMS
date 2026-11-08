/**
 * @file tests/e2e/global.setup.ts
 * @description Global setup for Playwright E2E tests
 *
 * Ensures clean state and required directories before tests run.
 * Critical for CI environments where gitignored folders don't exist.
 *
 * Isolation contract: this file must never create, write, or delete anything in
 * the developer's live roots — `mediaFolder/`, `config/collections/`,
 * `config/database/`, `config/private.ts`, root `.compiledCollections/`.
 * The harness owns `tests/e2e/.media/`, `config/test-database/`,
 * `config/test-collections/` and `tests/e2e/.auth/` (AGENTS §4).
 *
 * Cleanup strategy:
 * - LOCAL: Clean harness DB files if not locked, always clean the harness media root
 * - CI: Skip if fresh runner, clean if cached
 */

import { mkdirSync, existsSync, writeFileSync, unlinkSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { E2E_MEDIA_FOLDER } from "./harness-paths";

/**
 * Directories the harness owns and that must exist before a server boots.
 * Deliberately excludes the live `config/database` and `config/collections`:
 * under TEST_MODE the DB resolves to `config/test-database`
 * (`src/databases/config-state.ts`) and collections to `config/test-collections`
 * (`paths.getCollections()`).
 */
export function requiredE2EDirs(): string[] {
  return [
    join(process.cwd(), "config", "test-database"),
    join(process.cwd(), "config", "test-collections"),
    join(process.cwd(), "tests", "e2e", ".auth"),
    join(process.cwd(), "logs"),
    E2E_MEDIA_FOLDER,
  ];
}

/**
 * Harness-owned SQLite files that may survive a previous run. Names are kept
 * verbatim from the pre-isolation layout so cached CI workspaces are cleaned.
 */
export function e2eCleanupTargets(): string[] {
  const dbDir = join(process.cwd(), "config", "test-database");
  const names = [
    "sveltycms_test.sqlite",
    "sveltycms_test",
    "svelty_setup_test.sqlite",
    "sveltycms_e2e_ready.db.sqlite",
    "SveltyCMS_test.db.sqlite",
  ];
  return names
    .flatMap((name) => [name, `${name}-shm`, `${name}-wal`])
    .map((name) => join(dbDir, name));
}

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
  const skipCleanup = process.env.SKIP_TEST_CLEANUP === "true";

  if (skipCleanup) {
    console.log("[Global Setup] Cleanup skipped (SKIP_TEST_CLEANUP=true)");
  } else {
    console.log("[Global Setup] Cleaning old test data...");

    let deletedCount = 0;
    for (const path of e2eCleanupTargets()) {
      if (existsSync(path)) {
        try {
          unlinkSync(path);
          console.log(`[Global Setup] ✓ Deleted: ${path}`);
          deletedCount++;
        } catch (err) {
          // Ignore EBUSY errors (file locked by webServer)
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== "EBUSY") {
            console.warn(`[Global Setup] ⚠️ Failed to delete ${path}: ${code}`);
          }
        }
      }
    }

    // Clean the harness-owned media folder (keep the directory, remove files).
    // MUST NOT be the dev `mediaFolder`: the testing API and the dev server share
    // this checkout, so wiping that directory deleted the developer's uploads
    // while their DB rows survived (broken gallery tiles / editor loads).
    const mediaFolder = E2E_MEDIA_FOLDER;
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[Global Setup] ⚠️ Failed to clean E2E media folder: ${message}`);
      }
    }

    console.log(`[Global Setup] Cleanup completed (${deletedCount} items removed)`);
  }

  // STEP 3: Ensure the harness-owned directories exist. `recursive` also covers
  // the parent (`tests/e2e`), so a fresh CI runner never depends on `.gitkeep`.
  for (const dir of requiredE2EDirs()) {
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

  console.log("[Global Setup] All required directories verified ✓");
}
