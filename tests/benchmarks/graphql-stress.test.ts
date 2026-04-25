/**
 * @file tests/benchmarks/graphql-stress.test.ts
 * @description
 * Enterprise-grade GraphQL Stress & Load Test for SveltyCMS.
 * Real HTTP + realistic queries + High-Concurrency Load profiles + HDR Statistics.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import { performance } from "node:perf_hooks";
import {
  setupBenchmarkServer,
  ensureStableTestData,
  printTruthTable,
  measureMemory,
  stabilize,
} from "./benchmark-utils";
import { getDb } from "@src/databases/db";

const LOAD_PROFILES = {
  TINY: { total: 1000, concurrency: 10, name: "Tiny (CI/Local)", runs: 2 },
  MEDIUM: { total: 5000, concurrency: 40, name: "Medium (Workstation)", runs: 3 },
  LARGE: { total: 20000, concurrency: 80, name: "Large (Performance Testing)", runs: 3 },
  EXTREME: { total: 50000, concurrency: 120, name: "Extreme (Enterprise Cluster)", runs: 3 },
} as const;

type LoadLevel = keyof typeof LOAD_PROFILES;

const QUERIES = [
  {
    name: "System: Health",
    query: `query { contentSystemHealth { state version collectionCount } }`,
    validate: (json: any) => json.data?.contentSystemHealth?.state !== undefined,
  },
  {
    name: "System: Stats",
    query: `query { allCollectionStats { _id name status } }`,
    validate: (json: any) => Array.isArray(json.data?.allCollectionStats),
  },
  {
    name: "Content: List",
    query: `query { Benchmarkstable_benchmar(pagination: { limit: 10 }) { _id title status } }`,
    validate: (json: any) => Array.isArray(json.data?.Benchmarkstable_benchmar),
  },
];

let server: { baseUrl: string; stop: () => Promise<void> };
const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

beforeAll(async () => {
  console.log("🛠️  Preparing GraphQL Stress Suite...");
  server = await setupBenchmarkServer();

  // Seed data
  console.log("   Seeding stable test data...");
  await ensureStableTestData(getDb(), "global");

  await stabilize();
});

afterAll(async () => {
  if (server) await server.stop();
});

async function asyncPool(concurrency: number, total: number, fn: (i: number) => Promise<void>) {
  const executing = new Set<Promise<void>>();
  for (let i = 0; i < total; i++) {
    const p = fn(i).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

async function runProfile(level: LoadLevel) {
  const config = LOAD_PROFILES[level];
  console.log(
    `\n🚀 Stress Profile: ${config.name} (${config.total} reqs @ ${config.concurrency}c)`,
  );

  const profileResults: any[] = [];

  for (let run = 1; run <= config.runs; run++) {
    console.log(`   Run ${run}/${config.runs}...`);

    const latencies: number[] = [];
    let successes = 0;
    let failures = 0;
    const memStart = measureMemory();

    // 1. Warmup (10% or 100)
    const warmupCount = Math.min(100, Math.floor(config.total * 0.1));
    await asyncPool(config.concurrency, warmupCount, async (i) => {
      try {
        const q = QUERIES[i % QUERIES.length];
        await fetch(`${server.baseUrl}/api/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": secret,
            "x-test-mode": "true",
          },
          body: JSON.stringify({ query: q.query }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
    });

    // 2. Measured Load
    const startTime = performance.now();
    await asyncPool(config.concurrency, config.total, async (i) => {
      const q = QUERIES[i % QUERIES.length];
      const t0 = performance.now();
      try {
        const res = await fetch(`${server.baseUrl}/api/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": secret,
            "x-test-mode": "true",
          },
          body: JSON.stringify({ query: q.query }),
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);
        if (!q.validate(json)) throw new Error("Validation failed");

        latencies.push(performance.now() - t0);
        successes++;
      } catch {
        failures++;
      }
    });

    const totalTime = (performance.now() - startTime) / 1000;
    const memEnd = measureMemory();

    const sorted = latencies.sort((a, b) => a - b);
    profileResults.push({
      avgMs: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
      p75Ms: sorted[Math.floor(sorted.length * 0.75)] || 0,
      p90Ms: sorted[Math.floor(sorted.length * 0.9)] || 0,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99Ms: sorted[Math.floor(sorted.length * 0.99)] || 0,
      p999Ms: sorted[Math.floor(sorted.length * 0.999)] || 0,
      rps: successes / totalTime,
      errorRate: failures / (successes + failures),
      memDelta: memEnd.rss - memStart.rss,
    });
  }

  // Aggregate results (Take Median Run for representative numbers)
  profileResults.sort((a, b) => a.p95Ms - b.p95Ms);
  const median = profileResults[Math.floor(profileResults.length / 2)];

  return {
    name: `GQL Stress: ${level}`,
    layer: `${config.concurrency}c`,
    ...median,
  };
}

test("GraphQL Stress Audit (Enterprise)", async () => {
  const level = (process.env.LOAD_LEVEL as LoadLevel) || "TINY";
  const results = [];

  if (process.env.LOAD_LEVEL === "ALL") {
    for (const l of ["TINY", "MEDIUM"] as LoadLevel[]) {
      const r = await runProfile(l);
      results.push(r);
      if (r.errorRate > 0.05) {
        console.warn(`🛑 High error rate (${(r.errorRate * 100).toFixed(1)}%) at ${l}. Aborting.`);
        break;
      }
    }
  } else {
    results.push(await runProfile(level));
  }

  printTruthTable({
    title: "SVELTYCMS  —  GRAPHQL STRESS AUDIT",
    subtitle: `Real HTTP Load • High Concurrency • Error Validation`,
    results,
  });
}, 600000);
