#!/usr/bin/env bun
/**
 * @file scripts/verify-benchmark-local.ts
 * @description Pre-flight safety checks before running local benchmarks.
 *
 * Ensures:
 * - Production build exists with full testing harness (bench mode)
 * - Live `config/private.ts` does not point at test/benchmark DB names
 * - Local profile isolation boundaries are printed for operator visibility
 *
 * Usage:
 *   COMPILE_ALL_ADAPTERS=true bun run build
 *   bun run verify:benchmark-local
 *   bun run benchmark --db=sqlite
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertBenchmarkDbIsolation,
  developerPrivateConfigExists,
  getBenchmarkIsolationSummary,
  resolveBenchmarkProfile,
} from "../src/utils/benchmark-sandbox.ts";
import {
  isConfigSourceSafeForTesting,
  isUnsafeLiveDeveloperDbName,
} from "../src/utils/test-db-safety.ts";

const ROOT = process.cwd();
const BUILD_ENTRY = join(ROOT, "build", "index.js");
const PRIVATE_TS = join(ROOT, "config", "private.ts");
const PRIVATE_TEST = join(ROOT, "config", "private.test.ts");

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function checkBuild(): void {
  if (!existsSync(BUILD_ENTRY)) {
    fail("build/index.js missing. Run: COMPILE_ALL_ADAPTERS=true bun run build");
  }

  const verify = spawnSync(
    "bun",
    ["run", "scripts/verify-prod-build-backdoor.ts", "--mode=bench"],
    {
      cwd: ROOT,
      stdio: "pipe",
      shell: process.platform === "win32",
    },
  );

  if (verify.status !== 0) {
    console.error(verify.stderr?.toString() || verify.stdout?.toString());
    fail("Benchmark build missing testing harness. Run: COMPILE_ALL_ADAPTERS=true bun run build");
  }
}

function checkLiveConfig(): void {
  if (!developerPrivateConfigExists()) {
    console.log("  ℹ️  No config/private.ts — benchmarks will use CI-fresh profile");
    return;
  }

  const live = readFileSync(PRIVATE_TS, "utf8");
  const liveDb = live.match(/DB_NAME\s*:\s*['"`]([^'"`]+)['"`]/)?.[1];
  if (isUnsafeLiveDeveloperDbName(liveDb)) {
    fail(
      `config/private.ts uses test DB name '${liveDb}'. ` +
        "Point live config at a non-test database (e.g. sveltycms.db) before benchmarking.",
    );
  }

  if (existsSync(PRIVATE_TEST)) {
    const testContent = readFileSync(PRIVATE_TEST, "utf8");
    const { safe, dbName } = isConfigSourceSafeForTesting(testContent);
    if (!safe && dbName) {
      fail(
        `config/private.test.ts has unsafe DB_NAME '${dbName}'. ` +
          "Delete it and let the harness regenerate an isolated test config.",
      );
    }
  }
}

function main(): void {
  console.log("\n🛡️  Local Benchmark Pre-flight\n");

  checkBuild();
  console.log("  ✅ Benchmark build includes testing harness");

  checkLiveConfig();
  console.log("  ✅ Live config DB name is safe");

  assertBenchmarkDbIsolation("sqlite");

  const profile = resolveBenchmarkProfile();
  const summary = getBenchmarkIsolationSummary("sqlite");

  console.log(`\n  Profile: ${profile}`);
  if (summary.liveConfigProtected) {
    console.log("  Isolation (local sandbox — live data protected):");
    console.log(`    database          → ${summary.dbName}`);
    console.log(`    compiled/manifest → ${summary.compiledRoot}`);
    console.log(`    media             → ${summary.mediaRoot}`);
    console.log("    external services → Redis/SMTP/AI/webhooks disabled");
  } else {
    console.log("  CI-fresh mode: setup wizard may write private.test.ts only");
    console.log(`    database          → ${summary.dbName}`);
  }

  console.log("\n✅ Local benchmark pre-flight passed\n");
}

main();
