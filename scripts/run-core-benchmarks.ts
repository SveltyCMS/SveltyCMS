#!/usr/bin/env bun
/**
 * @file scripts/run-core-benchmarks.ts
 * @description
 * Runs the same core benchmark suite as ci.yml `bench-core` for one or all DB adapters.
 *
 * Usage:
 *   COMPILE_ALL_ADAPTERS=true bun run build
 *   docker compose -f tests/docker-compose.yml --profile postgresql up -d --wait
 *   bun run scripts/run-core-benchmarks.ts --db=postgresql
 *
 * Requires a production build with all DB adapters (CI sets COMPILE_ALL_ADAPTERS=true).
 * A default local `bun run build` only bundles SQLite — other adapters are stubs and
 * benchmarks that spawn `build/index.js` will fail immediately on DB init.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getBenchmarkTestEnv } from "../src/utils/test-db-credentials.ts";
import { printBenchmarkIsolationBanner } from "../src/utils/benchmark-sandbox.ts";

const ROOT = process.cwd();
const VALID_DBS = ["sqlite", "mongodb", "mariadb", "postgresql"] as const;

export const CI_CORE_BENCHMARK_TESTS = [
  "cold-start-phased",
  "truth-latency",
  "database-performance",
  "transaction-acid",
  "cache-performance",
  "hooks-performance",
  "rest-api-performance",
  "virtual-query-federation",
] as const;

function getArg(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((a) => a.startsWith(prefix))
    ?.slice(prefix.length);
}

function ensureTestSecret(): string {
  const secretPath = join(ROOT, "tests", "e2e", ".auth", "test-secret.txt");
  const authDir = join(ROOT, "tests", "e2e", ".auth");
  if (!existsSync(authDir)) mkdirSync(authDir, { recursive: true });

  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;

  if (existsSync(secretPath)) {
    return readFileSync(secretPath, "utf8").trim();
  }

  const secret = `SVELTYCMS_LOCAL_BENCH_${Date.now()}`;
  writeFileSync(secretPath, secret);
  return secret;
}

function assertBuildIncludesAdapter(db: (typeof VALID_DBS)[number]): boolean {
  if (db === "sqlite") return true;
  const chunksDir = join(ROOT, "build", "server", "chunks");
  if (!existsSync(chunksDir)) return true;
  const stubChunk = readdirSync(chunksDir).find((f) => f.includes(`_virtual_db-stub_${db}`));
  if (!stubChunk) return true;

  console.error(`\n❌ Production build stubs the ${db} adapter (found ${stubChunk}).`);
  console.error(
    "   Core benchmarks spawn build/index.js — PostgreSQL/MariaDB/MongoDB need a full adapter bundle.",
  );
  console.error("   Fix: COMPILE_ALL_ADAPTERS=true bun run build");
  console.error("   (CI build job sets this automatically; pre-push does too.)\n");
  return false;
}

async function runBenchmarksForDb(db: (typeof VALID_DBS)[number]): Promise<boolean> {
  if (!existsSync(join(ROOT, "build", "index.js"))) {
    console.error("❌ build/index.js missing. Run COMPILE_ALL_ADAPTERS=true bun run build first.");
    return false;
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
    console.error(
      "❌ Benchmark build missing testing harness. Run: COMPILE_ALL_ADAPTERS=true bun run build",
    );
    return false;
  }

  if (!assertBuildIncludesAdapter(db)) {
    return false;
  }

  const testSecret = ensureTestSecret();
  process.env.BENCHMARK = "true";
  const baseEnv = getBenchmarkTestEnv(db, {
    TEST_API_SECRET: testSecret,
  });

  console.log(`\n📊 Core benchmarks — ${db.toUpperCase()}`);
  printBenchmarkIsolationBanner(db);
  let failures = 0;

  for (const name of CI_CORE_BENCHMARK_TESTS) {
    // Kill any lingering server processes from previous test
    try {
      spawnSync("pkill", ["-f", "build/index.js"], {
        stdio: "pipe",
        shell: process.platform === "win32",
      });
    } catch {}
    // Wait for port to be freed + Docker container to stabilize
    await new Promise((r) => setTimeout(r, 3000));

    const file = `tests/benchmarks/${name}.test.ts`;
    console.log(`  ▶ ${file}`);

    const result = spawnSync("bun", ["test", file, "--timeout", "300000"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...baseEnv },
    });

    if (result.status !== 0) {
      failures++;
      console.error(`  ❌ ${file}`);
    }
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} benchmark test(s) failed for ${db}`);
    return false;
  }

  console.log(`\n✅ All core benchmarks passed for ${db}`);
  return true;
}

async function main() {
  const singleDb = getArg("--db") as (typeof VALID_DBS)[number] | undefined;

  if (singleDb && !VALID_DBS.includes(singleDb)) {
    console.error(`❌ Invalid --db="${singleDb}". Valid: ${VALID_DBS.join(", ")}`);
    process.exit(1);
  }

  const databases = singleDb ? [singleDb] : [...VALID_DBS];
  let allPassed = true;

  for (const db of databases) {
    const passed = await runBenchmarksForDb(db);
    if (!passed) allPassed = false;
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
