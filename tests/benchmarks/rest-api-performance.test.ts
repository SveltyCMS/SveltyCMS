/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Professional REST API performance suite using the Unified Dispatcher.
 *              Measures endpoint latency and memory overhead with high fidelity.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  checkBenchmarkEnv,
  stabilize,
  setupBenchmarkServer,
  updateBenchmarkDocumentation,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runRestApiBenchmark() {
  checkBenchmarkEnv();
  console.log("🚀 Starting SveltyCMS REST API Performance Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  await stabilize();

  const ITERATIONS = 1000;
  const WARMUP = 80;
  const RUNS = 3;

  const endpoints: Array<{ name: string; path: string; method?: string }> = [
    { name: "System Health (Public)", path: "/system/health" },
    { name: "User Profile (Auth)", path: "/auth" },
    { name: "Collections List (DB)", path: "/collections" },
  ];

  const results: any[] = [];

  for (const ep of endpoints) {
    console.log(`   → Benchmarking ${ep.name}`);

    const result = await runBenchmark({
      name: `REST: ${ep.name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      onSetup: stabilize,
      onIteration: async () => {
        const baseUrl = process.env.API_BASE_URL;
        const url = `${baseUrl}/api${ep.path}`;
        const method = ep.method || "GET";

        const headers: Record<string, string> = {
          "x-tenant-id": "global",
          "x-test-secret": process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026",
          "content-type": "application/json",
        };

        // Inject auth for non-public routes
        if (ep.path !== "/system/health") {
          headers["authorization"] = "Bearer benchmark-token";
        }

        const res = await fetch(url, {
          method,
          headers,
        });

        if (res.status < 200 || res.status >= 300) {
          throw new Error(`Endpoint ${ep.path} returned ${res.status}`);
        }
        await res.text();
      },
      silent: true,
    });

    results.push(result);
    // exportResult(result); // Decentralized reporter will handle individual results if we want, but we aggregate below
  }

  logger.level = "info";

  console.log("\n" + "=".repeat(120));
  console.log("   📊 SVELTYCMS REST API PERFORMANCE AUDIT");
  console.log("=".repeat(120));

  for (const r of results) {
    const rssStr =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";
    const displayName = r.name.replace("REST: ", "");
    console.log(
      `| ${displayName.padEnd(42)} | ` +
        `${r.avgMs.toFixed(4)} ms`.padEnd(24) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(14) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rssStr.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(120));

  const avgMs = results.reduce((sum, r) => sum + r.avgMs, 0) / results.length;
  const maxP95 = Math.max(...results.map((r) => r.p95Ms));
  const avgRps = results.reduce((sum, r) => sum + r.rps, 0) / results.length;

  const colRes = results.find((r) => r.name === "REST: Collections List (DB)");
  if (colRes) {
    exportMetric("rest.collections.avg", colRes.avgMs, "ms");
    exportMetric("rest.collections.p95", colRes.p95Ms, "ms");
    exportMetric("rest.collections.rps", colRes.rps, "req/s");
  }

  exportResult({
    name: "REST API Summary",
    avgMs: Number(avgMs.toFixed(4)),
    p95Ms: Number(maxP95.toFixed(3)),
    rps: Number(avgRps.toFixed(1)),
    shortLabel: "REST p95",
  });

  console.log("\n✅ REST API benchmark completed.");
  await updateBenchmarkDocumentation();
}

test("REST API Performance Suite", async () => {
  await runRestApiBenchmark();
}, 400000);
