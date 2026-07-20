#!/usr/bin/env bun
/**
 * @file scripts/check-test-db-safety.ts
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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isConfigSourceSafeForTesting,
  isUnsafeLiveDeveloperDbName,
} from "../src/utils/test-db-safety.ts";

const ROOT = process.cwd();
const TEST_CONFIG_PATH = join(ROOT, "config", "private.test.ts");
const LIVE_CONFIG_PATH = join(ROOT, "config", "private.ts");

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
