#!/usr/bin/env bun
/**
 * @file scripts/check-test-db-safety.ts
 * @description
 * Standalone, dependency-free (<50ms) safety check reused by both pre-commit
 * and pre-push. Catches unsafe config/private.test.ts files before any other
 * checks run — prevents the class of bug where a real (possibly production)
 * config/private.ts was copied as the test config.
 *
 * Invoked by: .githooks/pre-commit and scripts/quality-gate.ts
 * Manual run: bun run scripts/check-test-db-safety.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TEST_CONFIG_PATH = join(ROOT, "config", "private.test.ts");

if (!existsSync(TEST_CONFIG_PATH)) {
  // No test config exists yet — nothing to check, not an error.
  process.exit(0);
}

const content = readFileSync(TEST_CONFIG_PATH, "utf8");
const match = content.match(/DB_NAME:\s*["']([^"']+)["']/);
const dbName = match?.[1] ?? "";

if (!dbName) {
  console.error(
    "❌ config/private.test.ts exists but could not extract DB_NAME. " +
      "Delete it and let it regenerate.",
  );
  process.exit(1);
}

const lower = dbName.toLowerCase();
const safe =
  lower.includes("test") ||
  lower.includes("bench") ||
  lower.includes("e2e") ||
  lower.endsWith("_functional");

if (!safe) {
  console.error(
    `❌ config/private.test.ts has unsafe DB_NAME '${dbName}'. ` +
      "Delete it and let it regenerate with an isolated test DB name.",
  );
  process.exit(1);
}

// All good — nothing to print on success (keeps pre-commit output clean).
process.exit(0);
