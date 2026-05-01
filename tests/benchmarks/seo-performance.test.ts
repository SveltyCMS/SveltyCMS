/**
 * @file tests/benchmarks/seo-performance.test.ts
 * @description Enterprise SEO Suite benchmark for SveltyCMS.
 * Measures redirect lookup speed and dynamic sitemap generation latency.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  ensureStableTestData,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  await ensureStableTestData(db!);

  // Create a few test redirects for the benchmark
  await db!.crud.insert("redirects", {
    from: "/old-path-1",
    to: "/new-path-1",
    type: 301,
    tenantId: "default",
    active: true
  } as any);
  
  await db!.crud.insert("redirects", {
    from: "/old-path-2",
    to: "/new-path-2",
    type: 301,
    tenantId: "default",
    active: true
  } as any);
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

async function runSeoAudit() {
  console.log("🚀 Starting Enterprise SEO Suite Audit (E2E)...\n");

  const ITERATIONS = 500;
  const RUNS = 2;
  const results: any[] = [];

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Redirect Interception (In-Memory Cache)
    console.log("   → Measuring Redirect Middleware (Cached)...");
    const redirectRes = await runBenchmark({
      name: "Redirect Interception (Cache)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 8,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${apiBaseUrl}/old-path-1`, {
          redirect: "manual",
          headers: { "x-test-mode": "true" },
        });
        // We expect a 301/302 response
        if (res.status !== 301 && res.status !== 302) {
          throw new Error(`Redirect failed: ${res.status}`);
        }
      },
    });
    results.push({ ...redirectRes, layer: "SEO" });

    // 2. Dynamic Sitemap Generation (Cached)
    console.log("   → Measuring Sitemap Generation (Cached)...");
    // Hit once to warm cache
    await fetch(`${apiBaseUrl}/sitemap.xml`, { headers: { "x-test-mode": "true" } });

    const sitemapRes = await runBenchmark({
      name: "Sitemap Generation (Cached)",
      iterations: ITERATIONS,
      warmupIterations: 20,
      runs: RUNS,
      concurrency: 4,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${apiBaseUrl}/sitemap.xml`, {
          headers: { "x-test-mode": "true" },
        });
        await res.text();
      },
    });
    results.push({ ...sitemapRes, layer: "SEO" });

    // 3. Robots.txt Route
    console.log("   → Measuring Robots.txt Routing...");
    const robotsRes = await runBenchmark({
      name: "Robots.txt Route",
      iterations: ITERATIONS,
      warmupIterations: 20,
      runs: RUNS,
      concurrency: 4,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${apiBaseUrl}/robots.txt`, {
          headers: { "x-test-mode": "true" },
        });
        await res.text();
      },
    });
    results.push({ ...robotsRes, layer: "SEO" });

    printTruthTable({
      title: "SVELTYCMS  —  ENTERPRISE SEO SUITE AUDIT",
      subtitle: "Redirects • Dynamic Sitemaps • Robots • i18n hreflang",
      results,
    });

    printSummaryTable([
      { key: "Redirect Latency (Avg)", val: redirectRes.avgMs, unit: "ms" },
      { key: "Sitemap Latency (Cached)", val: sitemapRes.avgMs, unit: "ms" },
      { key: "Robots.txt Latency", val: robotsRes.avgMs, unit: "ms" },
      { key: "SEO Suite Peak RPS", val: Math.round(redirectRes.rps), unit: "req/s" },
    ]);

    for (const r of results) exportResult(r);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ SEO Suite audit completed.");
}

test("Enterprise SEO Suite Performance Audit", async () => {
  await runSeoAudit();
}, 450000);
