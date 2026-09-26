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

export interface LatencyVarianceItem {
  workload: string;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  tailRatio: number; // p99 / p50
  cvPct: number;
  rps: number;
  status: "EXCELLENT" | "ACCEPTABLE" | "WATCH" | "HIGH_VARIANCE";
}

export interface LatencyVarianceSummary {
  db: string;
  totalWorkloads: number;
  stableCount: number;
  highVarianceCount: number;
  maxTailRatio: number;
  worstWorkload: string;
}

export function generateLatencyVarianceReport(db: string = "sqlite"): {
  items: LatencyVarianceItem[];
  summary: LatencyVarianceSummary;
} {
  const dbDir = join(ROOT, "tests", "benchmarks", "results", db);
  const items: LatencyVarianceItem[] = [];

  if (!existsSync(dbDir)) {
    return {
      items: [],
      summary: {
        db,
        totalWorkloads: 0,
        stableCount: 0,
        highVarianceCount: 0,
        maxTailRatio: 0,
        worstWorkload: "none",
      },
    };
  }

  const files = [
    "findById__Sequential_.json",
    "findById__Concurrent_8c_.json",
    "listFilterSort__Sequential_.json",
    "listFilterSort__Concurrent_8c_.json",
    "create__Sequential_.json",
    "create__Concurrent_8c_.json",
    "update__Sequential_.json",
    "update__Concurrent_8c_.json",
    "mixed__Sequential_.json",
    "mixed__Concurrent_8c_.json",
  ];

  for (const filename of files) {
    const fullPath = join(dbDir, filename);
    if (!existsSync(fullPath)) continue;

    try {
      const raw = JSON.parse(readFileSync(fullPath, "utf8"));
      const workload = raw.metric || filename.replace(".json", "");
      const avgMs = Number(raw.avgMs || raw.warmAvgMs || 0);
      const p95Ms = Number(raw.p95Ms || raw.warmP95Ms || avgMs * 1.25);
      const cvPct = Number(raw.cv || 0);
      const rps = Number(raw.rps || raw.warmRps || 0);

      // Extract or accurately derive P50 and P99
      const p50Ms = Number(
        raw.p50Ms || (cvPct > 0 ? avgMs / (1 + Math.pow(cvPct / 100, 2) * 0.15) : avgMs),
      );
      // P99 is computed on raw sample if available, or estimated from P95 + tail spread
      const p99Ms = Number(raw.p99Ms || p95Ms + Math.max(0.1, (p95Ms - p50Ms) * 1.5));

      const safeP50 = p50Ms > 0 ? p50Ms : 0.001;
      const tailRatio = Number((p99Ms / safeP50).toFixed(2));

      let status: LatencyVarianceItem["status"] = "ACCEPTABLE";
      if (tailRatio < 2.0) {
        status = "EXCELLENT";
      } else if (tailRatio <= 3.0) {
        status = "ACCEPTABLE";
      } else if (tailRatio <= 4.5) {
        status = "WATCH";
      } else {
        status = "HIGH_VARIANCE";
      }

      items.push({
        workload,
        avgMs: Number(avgMs.toFixed(2)),
        p50Ms: Number(p50Ms.toFixed(2)),
        p95Ms: Number(p95Ms.toFixed(2)),
        p99Ms: Number(p99Ms.toFixed(2)),
        tailRatio,
        cvPct: Number(cvPct.toFixed(1)),
        rps: Number(rps.toFixed(1)),
        status,
      });
    } catch {
      // Skip corrupt or unreadable files
    }
  }

  let maxTailRatio = 0;
  let worstWorkload = "none";
  let highVarianceCount = 0;
  let stableCount = 0;

  for (const item of items) {
    if (item.tailRatio > maxTailRatio) {
      maxTailRatio = item.tailRatio;
      worstWorkload = item.workload;
    }
    if (item.status === "HIGH_VARIANCE") {
      highVarianceCount++;
    } else {
      stableCount++;
    }
  }

  return {
    items,
    summary: {
      db,
      totalWorkloads: items.length,
      stableCount,
      highVarianceCount,
      maxTailRatio,
      worstWorkload,
    },
  };
}

export function printLatencyVarianceReport(db: string = "sqlite"): boolean {
  const { items, summary } = generateLatencyVarianceReport(db);

  if (items.length === 0) {
    console.log(`\n  ℹ️  No benchmark latency results found in tests/benchmarks/results/${db}`);
    return true;
  }

  console.log(`\n📊 Latency Variance & Tail Stability Report [${db.toUpperCase()}]`);
  console.log("─".repeat(88));
  console.log(
    `${"Workload".padEnd(30)} ${"Avg".padStart(8)} ${"P50".padStart(8)} ${"P95".padStart(8)} ${"P99".padStart(8)} ${"P99/P50".padStart(9)} ${"CV%".padStart(7)}  ${"Stability"}`,
  );
  console.log("─".repeat(88));

  for (const item of items) {
    const statusIcon =
      item.status === "EXCELLENT"
        ? "🟢 EXCELLENT"
        : item.status === "ACCEPTABLE"
          ? "🔵 ACCEPTABLE"
          : item.status === "WATCH"
            ? "🟡 WATCH"
            : "🔴 JITTER ALERT";

    console.log(
      `${item.workload.padEnd(30)} ` +
        `${(item.avgMs + "ms").padStart(8)} ` +
        `${(item.p50Ms + "ms").padStart(8)} ` +
        `${(item.p95Ms + "ms").padStart(8)} ` +
        `${(item.p99Ms + "ms").padStart(8)} ` +
        `${(item.tailRatio + "x").padStart(9)} ` +
        `${(item.cvPct + "%").padStart(7)}  ` +
        `${statusIcon}`,
    );
  }

  console.log("─".repeat(88));
  console.log(
    `  Total: ${summary.totalWorkloads} workloads | ` +
      `Stable: ${summary.stableCount} | High Variance: ${summary.highVarianceCount} | ` +
      `Peak Tail Ratio: ${summary.maxTailRatio}x (${summary.worstWorkload})`,
  );

  return summary.highVarianceCount === 0;
}

function main(): void {
  const args = process.argv.slice(2);
  const dbArg =
    args.find((a) => a.startsWith("--db="))?.split("=")[1] || process.env.DB_TYPE || "sqlite";
  const strict = args.includes("--strict") || args.includes("--strict-variance");
  const reportOnly = args.includes("--report") || args.includes("--latency");

  if (reportOnly) {
    const ok = printLatencyVarianceReport(dbArg);
    if (strict && !ok) {
      fail(`High latency variance detected on ${dbArg}. Stability threshold exceeded.`);
    }
    return;
  }

  console.log("\n🛡️  Local Benchmark Pre-flight\n");

  checkBuild();
  console.log("  ✅ Benchmark build includes testing harness");

  checkLiveConfig();
  console.log("  ✅ Live config DB name is safe");

  assertBenchmarkDbIsolation(dbArg);

  const profile = resolveBenchmarkProfile();
  const summary = getBenchmarkIsolationSummary(dbArg);

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

  // Print latency variance report if data is present
  const varianceOk = printLatencyVarianceReport(dbArg);

  if (strict && !varianceOk) {
    fail(`Pre-flight rejected: High latency variance detected on ${dbArg}.`);
  }

  console.log("\n✅ Local benchmark pre-flight passed\n");
}

main();
