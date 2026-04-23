/**
 * @file tests/benchmarks/graphql-stress.ts
 * @description Professional GraphQL Stress & Load Test for SveltyCMS.
 *              Real HTTP + realistic queries + configurable load profiles.
 */

import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import path from "node:path";
import { getApiBaseUrl } from "../integration/helpers/server";
import { setupBenchmarkServer } from "./benchmark-utils";

const API_BASE_URL = getApiBaseUrl();

const LOAD_PROFILES = {
  TINY: { total: 2000, concurrency: 15, name: "Tiny (CI/Local)" },
  MEDIUM: { total: 10000, concurrency: 50, name: "Medium (Workstation)" },
  LARGE: { total: 50000, concurrency: 80, name: "Large (Performance Testing)" },
  EXTREME: { total: 150000, concurrency: 120, name: "Extreme (Server/Cluster)" },
} as const;

const QUERIES = [
  { name: "Me Query", query: `query { me { _id username email role } }` },
  {
    name: "System Health",
    query: `query { contentSystemHealth { state version collectionCount } }`,
  },
  {
    name: "Schema Introspection",
    query: `query { __schema { queryType { name } mutationType { name } } }`,
  },
  { name: "User Type Metadata", query: `query { __type(name: "User") { name fields { name } } }` },
  {
    name: "Nested Relations",
    query: `query {
    Authors_00000000(limit: 5) {
      name bio
      Posts(limit: 8) {
        title publishedAt
        author { name }
      }
    }
  }`,
  },
  {
    name: "Modern Collection: Single",
    query: `query { collections { posts(limit: 1) { title } } }`,
  },
  {
    name: "Modern Collection: List",
    query: `query { collections { posts(limit: 10) { title createdAt } } }`,
  },
];

type LoadLevel = keyof typeof LOAD_PROFILES;

async function asyncPool<T>(
  concurrency: number,
  items: T[],
  iteratorFn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const promise = Promise.resolve().then(() => iteratorFn(items[i], i));
    executing.add(promise);
    promise.finally(() => executing.delete(promise));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

async function runStressTest(level: LoadLevel) {
  const config = LOAD_PROFILES[level];
  const isDryRun = process.argv.includes("--dry-run");

  console.log(`\n🚀 [${level}] GraphQL Stress Test — ${config.name}`);
  console.log(`   Requests: ${config.total.toLocaleString()} | Concurrency: ${config.concurrency}`);

  if (isDryRun) {
    console.log("   🟡 DRY RUN — No actual requests sent.");
    return null;
  }

  // Auto-start internal server if no base URL is provided
  let stopServer: (() => Promise<void>) | undefined;
  let baseUrl = (process.env.API_BASE_URL || API_BASE_URL).replace("localhost", "127.0.0.1");

  if (!process.env.API_BASE_URL) {
    const { stop, baseUrl: internalUrl } = await setupBenchmarkServer();
    stopServer = stop;
    baseUrl = internalUrl;

    // Run system setup only for this stress test
    const { runSystemSetup } = await import("../../scripts/benchmark-matrix/server");
    const { ALL_DATABASES } = await import("../../scripts/benchmark-matrix/config");
    const dbType = (process.env.DB_TYPE || "sqlite").toLowerCase();
    const dbConf = ALL_DATABASES.find((d) => d.type === dbType) || ALL_DATABASES[0];
    const port = parseInt(baseUrl.split(":").pop() || "4173");

    await runSystemSetup(dbConf, port, `bench_tmp_${process.pid}`);
  }

  // Debug health and user count
  try {
    const healthRes = await fetch(`${baseUrl}/api/system/health`);
    const healthData = await healthRes.json();
    console.log(
      `   🏥 System Status: ${healthData.overallStatus || healthData.status}, Users: ${healthData.userCount ?? "unknown"}`,
    );
  } catch {
    console.warn("   ⚠️ Could not fetch system health for debug.");
  }

  const headers = {
    "Content-Type": "application/json",
    "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
  };

  const latencies: number[] = [];
  const statusCounts: Record<string | number, number> = {};
  let successes = 0;
  let failures = 0;

  const performRequest = async (index: number) => {
    const q = QUERIES[index % QUERIES.length];
    const start = performance.now();

    try {
      const res = await fetch(`${baseUrl}/api/graphql`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: q.query }),
        signal: AbortSignal.timeout(15000),
      });

      const duration = performance.now() - start;
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;

      if (res.ok) {
        successes++;
        latencies.push(duration);
      } else {
        failures++;
      }
    } catch (err: any) {
      failures++;
      const code = err.name === "TimeoutError" ? "TIMEOUT" : err.code || 999;
      statusCounts[code] = (statusCounts[code] || 0) + 1;
    }
  };

  // Warmup
  console.log(`   🔥 Warming up (${Math.min(300, config.total)} requests)...`);
  await asyncPool(config.concurrency, Array.from({ length: Math.min(300, config.total) }), (_, i) =>
    performRequest(i),
  );

  // Reset for real measurement
  latencies.length = 0;
  successes = failures = 0;
  Object.keys(statusCounts).forEach((k) => delete statusCounts[k]);

  // Main load
  console.log("   🧪 Running measured stress test...");
  const startTime = performance.now();

  await asyncPool(config.concurrency, Array.from({ length: config.total }), (_, i) =>
    performRequest(i),
  );

  const totalTime = performance.now() - startTime;
  const rps = totalTime > 0 ? (successes / totalTime) * 1000 : 0;

  // Statistics
  latencies.sort((a, b) => a - b);
  const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  console.log(`\n📊 === ${config.name.toUpperCase()} RESULTS ===`);
  console.log(`   Throughput     : ${rps.toFixed(1)} req/sec`);
  console.log(`   Total Time     : ${(totalTime / 1000).toFixed(2)}s`);
  console.log(
    `   Success Rate   : ${successes} (${((successes / config.total) * 100).toFixed(1)}%)`,
  );
  console.log(`   Failures       : ${failures}`);

  if (failures > 0) {
    console.log("   Status Breakdown:");
    Object.entries(statusCounts).forEach(([code, count]) => console.log(`     ${code}: ${count}`));
  }

  console.log(`\n   Latency:`);
  console.log(`     Avg : ${avg.toFixed(2)} ms`);
  console.log(`     p50 : ${p50.toFixed(2)} ms`);
  console.log(`     p95 : ${p95.toFixed(2)} ms`);
  console.log(`     p99 : ${p99.toFixed(2)} ms`);

  if (stopServer) {
    await stopServer();
  }

  return { level, rps, p95, p99, successes, failures, totalTime, avg };
}

async function main() {
  const target = (process.env.LOAD_LEVEL as any) || "TINY";
  const resultsDir =
    process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");

  const { printAuditTable } = await import("./benchmark-utils");

  try {
    await fs.mkdir(resultsDir, { recursive: true });

    const results: any[] = [];
    const auditResults: any[] = [];

    if (target === "ALL") {
      for (const level of Object.keys(LOAD_PROFILES) as LoadLevel[]) {
        const res = await runStressTest(level);
        if (res) {
          results.push(res);
          auditResults.push({
            name: `GQL Stress: ${level}`,
            avgMs: res.avg,
            p95Ms: res.p95,
            rps: res.rps,
          });
        }

        if (res && res.failures > res.successes * 0.08) {
          console.warn(`\n⚠️  High failure rate detected at ${level}. Stopping escalation.`);
          break;
        }
      }
    } else {
      const res = await runStressTest(target);
      if (res) {
        results.push(res);
        auditResults.push({
          name: `GQL Stress: ${target}`,
          avgMs: res.avg,
          p95Ms: res.p95,
          rps: res.rps,
        });
      }
    }

    printAuditTable({
      title: "SVELTYCMS  —  GRAPHQL LOAD STRESS",
      subtitle: `Profile: ${target} • High-Concurrency Stress`,
      results: auditResults,
      shortLabel: "GQL",
    });
    const filePath = path.join(resultsDir, `graphql-stress-${target.toLowerCase()}.json`);
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          name: "GraphQL Stress Test",
          timestamp: new Date().toISOString(),
          target,
          profiles: results,
        },
        null,
        2,
      ),
    );

    console.log(`\n💾 Results saved → ${filePath}`);
  } catch (err) {
    console.error("\n❌ GraphQL Stress Test failed:", err);
    process.exit(1);
  }
}

import { test } from "bun:test";

if (import.meta.main && !process.env.TEST_MODE) {
  main();
}

test("GraphQL Stress & Load Benchmark (Enterprise)", async () => {
  // Ensure we don't save files during CI tests if not requested
  if (!process.env.LOAD_LEVEL) {
    process.env.LOAD_LEVEL = "TINY";
  }
  await main();
}, 600000); // 10 minute timeout for extreme loads
