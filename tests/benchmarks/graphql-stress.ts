/**
 * @file tests/benchmarks/graphql-stress.ts
 * @description Professional Stress Test for SveltyCMS GraphQL API.
 *
 * Features:
 * - Warmup Phase (to avoid JIT skew)
 * - Internal Concurrency Pool (Async Pool)
 * - Query Rotation (Representative CMS workloads)
 * - Percentile Latency (Avg, p50, p95, p99)
 * - Status Code Failure Breakdown
 */

import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import path from "node:path";
import { getApiBaseUrl } from "../integration/helpers/server";

const API_BASE_URL = getApiBaseUrl();

// --- Configuration & Profiles ---
const LOAD_PROFILES = {
  TINY: { total: 1000, concurrency: 10, name: "Tiny (CI/Local)" },
  MEDIUM: { total: 10000, concurrency: 50, name: "Medium (Workstation)" },
  LARGE: { total: 50000, concurrency: 80, name: "Large (Performance Server)" },
  EXTREME: { total: 200000, concurrency: 120, name: "Extreme (Cluster)" },
};

const QUERIES = [
  {
    name: "Me (Basic)",
    body: JSON.stringify({ query: `query { me { username email role } }` }),
  },
  {
    name: "System Health",
    body: JSON.stringify({
      query: `query { contentSystemHealth { state version collectionCount } }`,
    }),
  },
  {
    name: "Introspection (Schema)",
    body: JSON.stringify({
      query: `query { __schema { queryType { name } } }`,
    }),
  },
  {
    name: "Metadata (User Type)",
    body: JSON.stringify({
      query: `query { __type(name: "User") { name fields { name } } }`,
    }),
  },
  {
    name: "Relational (Authors -> Posts)",
    body: JSON.stringify({
      query: `query NestedRelation {
        Authors_00000000 {
          name
          bio
          Posts {
            title
            author {
              name
            }
          }
        }
      }`,
    }),
  },
];

/**
 * Basic Internal Concurrency Limiter (Pool)
 */
async function asyncPool(
  concurrency: number,
  iterable: any[],
  iteratorFn: (item: any, i: number) => Promise<any>,
) {
  const ret: any[] = [];
  const executing: any[] = [];
  for (const item of iterable) {
    const p = Promise.resolve().then(() => iteratorFn(item, iterable.indexOf(item)));
    ret.push(p);
    if (concurrency <= iterable.length) {
      const e: any = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function runStressTest(level: keyof typeof LOAD_PROFILES) {
  const config = LOAD_PROFILES[level];
  const IS_DRY_RUN = process.argv.includes("--dry-run");

  console.log(`\n🚀 [${level}] GraphQL Stress Test: ${config.name}`);
  console.log(`   Target: ${config.total} total requests | Concurrency: ${config.concurrency}`);

  if (IS_DRY_RUN) {
    console.log("   🟡 DRY RUN ENABLED - No requests will be sent.");
    return;
  }

  // Use local dev port 5173 if running in dev mode
  const apiBase = (process.env.API_BASE_URL || API_BASE_URL).replace("localhost", "127.0.0.1");
  console.log(`   🔗 Targeting: ${apiBase}`);

  // Login directly to avoid destructive cleanup/seeding from prepareAuthenticatedContext
  console.log("   🔑 Logging in to benchmark state...");
  const loginRes = await fetch(`${apiBase}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.com",
      password: process.env.ADMIN_PASSWORD || "Password123!",
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!loginRes.ok) {
    const errorBody = await loginRes.text();
    throw new Error(
      `❌ Login failed [${loginRes.status}]: ${errorBody}. Ensure benchmark data is seeded (bun run scripts/setup-benchmarks.ts)`,
    );
  }

  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("❌ Login failed: No session cookie returned.");
  }

  const headers = {
    "Content-Type": "application/json",
    Cookie: setCookie,
  };

  const latencies: number[] = [];
  const statusCodes: Record<number, number> = {};
  let successes = 0;
  let failures = 0;

  const performRequest = async (i: number) => {
    // Rotate queries
    const selected = QUERIES[i % QUERIES.length];
    const start = performance.now();
    try {
      const res = await fetch(`${API_BASE_URL}/api/graphql`, {
        method: "POST",
        headers,
        body: selected.body,
        signal: AbortSignal.timeout(10000),
      });

      const duration = performance.now() - start;
      statusCodes[res.status] = (statusCodes[res.status] || 0) + 1;

      if (res.ok) {
        successes++;
        latencies.push(duration);
      } else {
        failures++;
      }
    } catch (err: any) {
      failures++;
      const code = err.code || 999; // 999 for network/unknown
      statusCodes[code] = (statusCodes[code] || 0) + 1;
    }
  };

  // --- 1. Warmup Phase (Not measured) ---
  console.log("   🔥 Warming up (200 requests)...");
  await asyncPool(config.concurrency, Array.from({ length: 200 }), (_, i) => performRequest(i));

  // Reset counters after warmup
  latencies.length = 0;
  successes = 0;
  failures = 0;
  Object.keys(statusCodes).forEach((k) => delete statusCodes[Number(k)]);

  // --- 2. Real Measurement Phase ---
  console.log("   🧪 Measuring performance...");
  const startTime = performance.now();

  await asyncPool(config.concurrency, Array.from({ length: config.total }), (_, i) =>
    performRequest(i),
  );

  const totalTime = performance.now() - startTime;
  const rps = (successes / totalTime) * 1000;

  // Calculate Percentiles
  latencies.sort((a, b) => a - b);
  const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Throughput: ${rps.toFixed(2)} req/sec`);
  console.log(`   ⏱️  Total Time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`   📉 Success: ${successes} (${((successes / config.total) * 100).toFixed(2)}%)`);
  console.log(`   🔴 Failures: ${failures}`);

  if (failures > 0) {
    console.log(`   🚨 Status Codes Breakdown:`);
    Object.entries(statusCodes).forEach(([code, count]) => {
      console.log(`      ${code}: ${count}`);
    });
  }

  console.log(`\n📋 Latency Percentiles:`);
  console.log(`   Avg: ${avg.toFixed(2)}ms`);
  console.log(`   p50: ${p50.toFixed(2)}ms (median)`);
  console.log(`   p95: ${p95.toFixed(2)}ms`);
  console.log(`   p99: ${p99.toFixed(2)}ms`);

  return { level, rps, failures, successes, p95 };
}

async function main() {
  const target = (process.env.LOAD_LEVEL as keyof typeof LOAD_PROFILES) || "TINY";
  const resultsDir =
    process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");

  try {
    const results: any[] = [];
    if ((target as any) === "ALL") {
      for (const level of Object.keys(LOAD_PROFILES)) {
        const result = await runStressTest(level as any);
        if (result) results.push(result);
        if (result && result.failures > result.successes * 0.1) {
          console.warn(`\n⚠️  System breaking point reached at level: ${level}`);
          break;
        }
      }
    } else {
      const result = await runStressTest(target);
      if (result) results.push(result);
    }

    // Export to JSON
    const filePath = path.join(resultsDir, "graphql-stress.json");
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          name: "GraphQL Stress",
          timestamp: new Date().toISOString(),
          profiles: results,
        },
        null,
        2,
      ),
    );
    console.log(`💾 Results exported to: ${filePath}`);
  } catch (err) {
    console.error("\n❌ Benchmark failed:", err);
    process.exit(1);
  }
}

main();
