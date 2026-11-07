#!/usr/bin/env bun
/**
 * @file scripts/check/check-test-db-safety.ts
 * @description
 * Standalone safety check for pre-commit / pre-push (<50ms).
 *
 * ### Private config policy (live data safety)
 * - Local automated runs must **never read or write config/private.ts**
 *   (live CMS — corruption risk). Use **config/private.test.ts** only.
 * - CI may create ephemeral private.ts on the runner (never committed).
 *
 * Also catches unsafe private.test.ts DB names and live private.ts pointing at
 * test DBs (e.g. sveltycms_test / benchmark_shared).
 *
 * Invoked by: .githooks/pre-commit
 * Manual: bun run scripts/check-test-db-safety.ts
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isLiveMediaFolder } from "../../src/utils/media/storage-adapters.ts";
import {
  isConfigSourceSafeForTesting,
  isUnsafeLiveDeveloperDbName,
} from "../../src/utils/test-db-safety.ts";

const ROOT = process.cwd();
const TEST_CONFIG_PATH = join(ROOT, "config", "private.test.ts");
const LIVE_CONFIG_PATH = join(ROOT, "config", "private.ts");
const LIVE_COLLECTIONS_DIR = join(ROOT, "config", "collections");
const LIVE_COMPILED_DIR = join(ROOT, ".compiledCollections");
const LIVE_DATABASE_DIR = join(ROOT, "config", "database");

// 1. Guard MEDIA_FOLDER in test mode
if (
  (process.env.TEST_MODE === "true" || process.env.PLAYWRIGHT_TEST === "true") &&
  process.env.MEDIA_FOLDER &&
  isLiveMediaFolder(process.env.MEDIA_FOLDER)
) {
  console.error(
    `❌ MEDIA_FOLDER='${process.env.MEDIA_FOLDER}' points at the live developer media directory under test mode. ` +
      "Tests must use an isolated media directory (e.g. tests/integration/.media or tests/e2e/.media).",
  );
  process.exit(1);
}

// 2. Guard live config/collections against test/benchmark debris
if (existsSync(LIVE_COLLECTIONS_DIR)) {
  const leakedFiles = readdirSync(LIVE_COLLECTIONS_DIR).filter((name) =>
    /^(mock_collection_|bench_|benchmark_)/i.test(name),
  );
  if (leakedFiles.length > 0) {
    console.error(
      `❌ Live config/collections/ contains test/benchmark artifacts: ${leakedFiles.join(", ")}. ` +
        "Test collections belong in config/test-collections/ only.",
    );
    process.exit(1);
  }
}

// 3. Guard live .compiledCollections root against test/benchmark debris
if (existsSync(LIVE_COMPILED_DIR)) {
  const leakedCompiled = readdirSync(LIVE_COMPILED_DIR).filter((name) =>
    /^(mock_collection_|bench_|benchmark_|\.loader-test-)/i.test(name),
  );
  if (leakedCompiled.length > 0) {
    console.error(
      `❌ Live .compiledCollections/ root contains test/benchmark artifacts: ${leakedCompiled.join(", ")}. ` +
        "Test compiled collections belong in .compiledCollections/test-collections/ only.",
    );
    process.exit(1);
  }
}

// 4. Guard live config/database against test/benchmark SQLite DBs
if (existsSync(LIVE_DATABASE_DIR)) {
  const leakedDbs = readdirSync(LIVE_DATABASE_DIR).filter((name) => {
    if (!/\.(sqlite|db)(-wal|-shm)?$/i.test(name)) return false;
    const stem = name.replace(/\.(sqlite|db)(-wal|-shm)?$/i, "");
    return isUnsafeLiveDeveloperDbName(stem);
  });
  if (leakedDbs.length > 0) {
    console.error(
      `❌ Live config/database/ contains isolated test/benchmark database file(s): ${leakedDbs.join(", ")}. ` +
        "Test databases belong in config/test-database/ only.",
    );
    process.exit(1);
  }
}

let liveDbName: string | undefined;

if (existsSync(LIVE_CONFIG_PATH)) {
  const live = readFileSync(LIVE_CONFIG_PATH, "utf8");
  liveDbName = live.match(/DB_NAME\s*:\s*['"`]([^'"`]+)['"`]/)?.[1];
  if (isUnsafeLiveDeveloperDbName(liveDbName)) {
    console.error(
      `❌ config/private.ts uses test DB name '${liveDbName}'. ` +
        "Live developer config must use a non-test database (e.g. sveltycms.db).",
    );
    process.exit(1);
  }
}

if (!existsSync(TEST_CONFIG_PATH)) {
  // No test config exists yet — nothing to check, not an error.
  process.exit(0);
}

const content = readFileSync(TEST_CONFIG_PATH, "utf8");
const { dbName, safe } = isConfigSourceSafeForTesting(content);

if (!dbName) {
  console.error(
    "❌ config/private.test.ts exists but could not extract DB_NAME. " +
      "Delete it and let it regenerate.",
  );
  process.exit(1);
}

if (!safe) {
  console.error(
    `❌ config/private.test.ts has unsafe DB_NAME '${dbName}'. ` +
      "Delete it and let it regenerate with an isolated test DB name.",
  );
  process.exit(1);
}

// Fail-closed: test config must never point at the same DB as live private.ts
if (liveDbName && dbName === liveDbName) {
  console.error(
    `❌ config/private.test.ts DB_NAME '${dbName}' matches live config/private.ts. ` +
      "Tests/benchmarks must use an isolated database (e.g. sveltycms_test, benchmark_shared) " +
      "so live user data is never destroyed.",
  );
  process.exit(1);
}

// All good — nothing to print on success (keeps pre-commit output clean).
process.exit(0);
