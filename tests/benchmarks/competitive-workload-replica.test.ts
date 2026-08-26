/**
 * @file tests/benchmarks/competitive-workload-replica.test.ts
 * @description Competitive Workload Replica Benchmark (8 Concurrent Workers)
 * @summary Measures the exact 9 workloads tested in the external benchmark harness against the local server.
 *
 * ### Features:
 * - Seeding throughput (REST bulk writes)
 * - Concurrent findById & findByIdRandom
 * - Concurrent listPlain, listFilterSort, and listLarge
 * - Concurrent findMissing (negative lookup)
 * - Concurrent GraphQL query throughput
 * - Concurrent create, update, and mixed read/write workloads
 *
 * ### 🏭 External-harness comparison caveat (read before quoting these numbers)
 * The write workloads (create/update/mixed) are queueing-bound under 8 workers:
 * per-request serial work is ~1.3ms (hooks ~0.44ms + resolve/SDK ~0.88ms), so
 * the concurrent p50 of 6-9ms is EVENT-LOOP + SQLite single-writer queueing, not
 * request work. When comparing against the external benchmark container, its
 * `--max-old-space-size=256` cap forces major GC under write concurrency and
 * inflates p50/p95 by 3-6× (measured: 37.8ms vs 6.99ms for create). Run with
 * the cap raised (≥1024) or unbounded before attributing any regression to code.
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import crypto from "node:crypto";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;
const SEED_COUNT = 300;
const createdIds: string[] = [];

test("Competitive 9-Workload Replica Benchmark", async () => {
  logger.info("🚀 Starting Competitive 9-Workload Replica Benchmark (8 Workers)...");

  await ensureStableTestData();
  const serverInfo = await setupBenchmarkServer();
  stopServer = serverInfo.stop;
  baseUrl = serverInfo.baseUrl;
  const headers = {
    ...benchmarkAuthHeaders(),
    "content-type": "application/json",
  };
  const dbType = getDbType();

  // Pre-seed a known batch for read/update workloads
  logger.info(`   → Pre-seeding ${SEED_COUNT} benchmark records...`);
  for (let i = 0; i < SEED_COUNT; i++) {
    const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `Item ${i}`,
        slug: `item-${i}`,
        content: `Content for item ${i} with representative text payload`,
        published: true,
        status: "published",
        views: i * 10,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as any;
      const id = json?.data?._id || json?.data?.id || json?._id || json?.id;
      if (id) createdIds.push(String(id));
    }
  }
  logger.info(`   ✅ Pre-seeded ${createdIds.length} records.`);

  const stableId = createdIds[0] || "20000000-0000-4000-8000-000000000001";
  let updateIdx = 0;

  const workloads = [
    {
      name: "findById (Concurrent 8c)",
      shortLabel: "findById",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${stableId}`, {
          headers,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
      concurrency: 8,
    },
    {
      name: "findByIdRandom (Concurrent 8c)",
      shortLabel: "findByIdRandom",
      fn: async () => {
        const randomId = createdIds[Math.floor(Math.random() * createdIds.length)] || stableId;
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${randomId}`, {
          headers,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
      concurrency: 8,
    },
    {
      name: "listPlain (Concurrent 8c)",
      shortLabel: "listPlain",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=10`, {
          headers,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
      concurrency: 8,
    },
    {
      name: "listFilterSort (Concurrent 8c)",
      shortLabel: "listFilterSort",
      fn: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/BenchmarkStable?limit=10&sort=createdAt&sortDirection=desc`,
          { headers },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
      concurrency: 8,
    },
    {
      name: "listLarge (Concurrent 8c)",
      shortLabel: "listLarge",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=50`, {
          headers,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
      concurrency: 8,
    },
    {
      name: "findMissing (Concurrent 8c)",
      shortLabel: "findMissing",
      fn: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/BenchmarkStable/00000000-0000-4000-8000-000000000000`,
          {
            headers,
          },
        );
        if (res.status !== 404 && !res.ok) throw new Error(`Unexpected HTTP ${res.status}`);
        await res.text();
      },
      concurrency: 8,
    },
    {
      name: "GraphQL Collection Query (Concurrent 8c)",
      shortLabel: "GraphQL",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/graphql`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: "query { BenchmarkStable(pagination: { limit: 10 }) { _id title } }",
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as any;
        if (!Array.isArray(body?.data?.BenchmarkStable) || body.data.BenchmarkStable.length === 0) {
          throw new Error(`GraphQL BenchmarkStable returned 0 rows: ${JSON.stringify(body)}`);
        }
      },
      concurrency: 8,
    },
    {
      name: "create (Concurrent 8c)",
      shortLabel: "create",
      fn: async () => {
        const uniq = crypto.randomUUID();
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: `Created Item ${uniq}`,
            slug: `created-${uniq}`,
            content: "Concurrent create test payload content",
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
      concurrency: 8,
    },
    {
      name: "update (Concurrent 8c)",
      shortLabel: "update",
      fn: async () => {
        const targetId = createdIds[updateIdx++ % createdIds.length] || stableId;
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${targetId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            title: `Updated Title ${Date.now()}`,
            views: Math.floor(Math.random() * 1000),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
      concurrency: 8,
    },
    {
      name: "mixed (Concurrent 8c 50/50)",
      shortLabel: "mixed",
      fn: async () => {
        const isWrite = Math.random() < 0.5;
        if (isWrite) {
          const targetId = createdIds[Math.floor(Math.random() * createdIds.length)] || stableId;
          const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${targetId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ views: Math.floor(Math.random() * 500) }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.json();
        } else {
          const randId = createdIds[Math.floor(Math.random() * createdIds.length)] || stableId;
          const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${randId}`, {
            headers,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.json();
        }
      },
      concurrency: 8,
    },
  ];

  const results: any[] = [];

  for (const w of workloads) {
    await stabilize();
    logger.info(`   → Testing ${w.name}...`);
    const res = await runBenchmark({
      name: w.name,
      warmupIterations: 15,
      iterations: 80,
      concurrency: w.concurrency,
      onIteration: w.fn,
    });
    results.push({ ...res, shortLabel: w.shortLabel });
    exportResult(res);
  }

  printTruthTable({
    title: `COMPETITIVE 9-WORKLOAD REPLICA (${dbType.toUpperCase()})`,
    subtitle: "Replicates the 9 external benchmark workloads under 8 parallel workers.",
    results,
  });

  const summaryMetrics = results.map((r) => ({
    key: r.shortLabel || r.name,
    val: r.rps.toFixed(1),
    unit: "RPS",
  }));

  printSummaryTable(summaryMetrics, "Competitive");

  const findByIdRes = results.find((r) => r.shortLabel === "findById");
  const listPlainRes = results.find((r) => r.shortLabel === "listPlain");
  const gqlRes = results.find((r) => r.shortLabel === "GraphQL");

  if (findByIdRes) exportMetric("competitive.find_by_id.rps", findByIdRes.rps, "req/s");
  if (listPlainRes) exportMetric("competitive.list_plain.rps", listPlainRes.rps, "req/s");
  if (gqlRes) exportMetric("competitive.graphql.rps", gqlRes.rps, "req/s");

  if (stopServer) {
    await stopServer();
    stopServer = null;
  }
}, 120_000);
