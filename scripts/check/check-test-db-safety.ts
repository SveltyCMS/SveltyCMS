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
 * Features:
 * - MEDIA_FOLDER guard under TEST_MODE / PLAYWRIGHT_TEST
 * - Debris filters for live `config/collections`, `.compiledCollections` and
 *   `config/database` (exported so the pre-commit gate's patterns are pinned)
 * - Fail-closed when the test config's DB_NAME equals the live config's
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

const TEST_COLLECTION_ARTIFACT_RE = /^(mock_collection_|bench_|benchmark_)/i;
const TEST_COMPILED_ARTIFACT_RE = /^(mock_collection_|bench_|benchmark_|\.loader-test-)/i;
const DATABASE_FILE_RE = /\.(sqlite|db)(-wal|-shm)?$/i;

/** Names under live `config/collections/` that belong in a test directory. */
export function findLeakedCollectionArtifacts(names: readonly string[]): string[] {
  return names.filter((name) => TEST_COLLECTION_ARTIFACT_RE.test(name));
}

/** Names under the live `.compiledCollections/` root that belong in a test directory. */
export function findLeakedCompiledArtifacts(names: readonly string[]): string[] {
  return names.filter((name) => TEST_COMPILED_ARTIFACT_RE.test(name));
}

/** SQLite/DB files (including `-wal`/`-shm` sidecars) that point at a test database. */
export function findLeakedDatabaseArtifacts(names: readonly string[]): string[] {
  return names.filter((name) => {
    if (!DATABASE_FILE_RE.test(name)) return false;
    const stem = name.replace(DATABASE_FILE_RE, "");
    return isUnsafeLiveDeveloperDbName(stem);
  });
}

function main(): number {
  const root = process.cwd();
  const testConfigPath = join(root, "config", "private.test.ts");
  const liveConfigPath = join(root, "config", "private.ts");
  const liveCollectionsDir = join(root, "config", "collections");
  const liveCompiledDir = join(root, ".compiledCollections");
  const liveDatabaseDir = join(root, "config", "database");

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
    return 1;
  }

  // 2. Guard live config/collections against test/benchmark debris
  if (existsSync(liveCollectionsDir)) {
    const leakedFiles = findLeakedCollectionArtifacts(readdirSync(liveCollectionsDir));
    if (leakedFiles.length > 0) {
      console.error(
        `❌ Live config/collections/ contains test/benchmark artifacts: ${leakedFiles.join(", ")}. ` +
          "Test collections belong in config/test-collections/ only.",
      );
      return 1;
    }
  }

  // 3. Guard live .compiledCollections root against test/benchmark debris
  if (existsSync(liveCompiledDir)) {
    const leakedCompiled = findLeakedCompiledArtifacts(readdirSync(liveCompiledDir));
    if (leakedCompiled.length > 0) {
      console.error(
        `❌ Live .compiledCollections/ root contains test/benchmark artifacts: ${leakedCompiled.join(", ")}. ` +
          "Test compiled collections belong in .compiledCollections/test-collections/ only.",
      );
      return 1;
    }
  }

  // 4. Guard live config/database against test/benchmark SQLite DBs
  if (existsSync(liveDatabaseDir)) {
    const leakedDbs = findLeakedDatabaseArtifacts(readdirSync(liveDatabaseDir));
    if (leakedDbs.length > 0) {
      console.error(
        `❌ Live config/database/ contains isolated test/benchmark database file(s): ${leakedDbs.join(", ")}. ` +
          "Test databases belong in config/test-database/ only.",
      );
      return 1;
    }
  }

  let liveDbName: string | undefined;

  if (existsSync(liveConfigPath)) {
    const live = readFileSync(liveConfigPath, "utf8");
    liveDbName = live.match(/DB_NAME\s*:\s*['"`]([^'"`]+)['"`]/)?.[1];
    if (isUnsafeLiveDeveloperDbName(liveDbName)) {
      console.error(
        `❌ config/private.ts uses test DB name '${liveDbName}'. ` +
          "Live developer config must use a non-test database (e.g. sveltycms.db).",
      );
      return 1;
    }
  }

  if (!existsSync(testConfigPath)) {
    // No test config exists yet — nothing to check, not an error.
    return 0;
  }

  const content = readFileSync(testConfigPath, "utf8");
  const { dbName, safe } = isConfigSourceSafeForTesting(content);

  if (!dbName) {
    console.error(
      "❌ config/private.test.ts exists but could not extract DB_NAME. " +
        "Delete it and let it regenerate.",
    );
    return 1;
  }

  if (!safe) {
    console.error(
      `❌ config/private.test.ts has unsafe DB_NAME '${dbName}'. ` +
        "Delete it and let it regenerate with an isolated test DB name.",
    );
    return 1;
  }

  // Fail-closed: test config must never point at the same DB as live private.ts
  if (liveDbName && dbName === liveDbName) {
    console.error(
      `❌ config/private.test.ts DB_NAME '${dbName}' matches live config/private.ts. ` +
        "Tests/benchmarks must use an isolated database (e.g. sveltycms_test, benchmark_shared) " +
        "so live user data is never destroyed.",
    );
    return 1;
  }

  // All good — nothing to print on success (keeps pre-commit output clean).
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
