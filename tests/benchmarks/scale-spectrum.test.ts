/**
 * @file tests/benchmarks/scale-spectrum.test.ts
 * @description Stepped Scale-Spectrum Benchmark (1 to 10,000 Entries).
 * @summary Measures degradation cliffs across PK lookup, list+filter, GraphQL, and write lanes.
 *
 * Steps: 1, 10, 100, 1,000, 5,000, 10,000 rows.
 * Features:
 * - Incremental seeding: seeds step-by-step up to the target scale
 * - True uniform random sampling across the current population
 * - Measures 4 critical routes at each step: findByIdRandom, listFilterSort, graphql, create
 * - Computes latency growth and degradation factor vs 1-row baseline
 */

import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  stabilize,
  exportMetric,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import crypto from "node:crypto";

// Configurable target steps; override via BENCH_STEPS="1,10,100,1000,5000,10000"
const DEFAULT_STEPS = [1, 10, 100, 1000, 5000, 10000];
const TARGET_STEPS = process.env.BENCH_STEPS
  ? process.env.BENCH_STEPS.split(",")
      .map(Number)
      .filter((n) => n > 0)
      .sort((a, b) => a - b)
  : DEFAULT_STEPS;

const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY) || 8;
const ITERS_PER_STEP = Number(process.env.BENCH_STEP_ITERS) || 100;
const WARMUP_ITERS = 20;

function seedArticlePayload(i: number, runId: string) {
  return {
    title: `Scaling headless CMS for enterprise — Entry ${i}`,
    slug: `scale-article-${runId}-${i}`,
    status: i % 3 === 0 ? "draft" : "published",
    count: i * 10,
    publishDate: "2026-01-01T00:00:00.000Z",
    content: `# Entry ${i}\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. `.repeat(6),
  };
}

test("Scale Spectrum Degradation Benchmark (1 to 10,000 Rows)", async () => {
  let stopServer: (() => Promise<void>) | null = null;
  const createdIds: string[] = [];

  try {
    const dbType = getDbType().toUpperCase();
    logger.info(
      `🚀 Starting Scale Spectrum Audit on ${dbType} across steps: ${TARGET_STEPS.join(", ")}...`,
    );

    const serverInfo = await setupBenchmarkServer();
    stopServer = serverInfo.stop;
    const baseUrl = serverInfo.baseUrl;

    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      "x-test-security": "true",
      connection: "keep-alive",
    };

    const runId = crypto.randomUUID().slice(0, 8);
    const collectionUrl = `${baseUrl}/api/collections/BenchmarkStable`;
    const gqlUrl = `${baseUrl}/api/graphql`;
    const gqlBody = JSON.stringify({
      query: "query { BenchmarkStable(pagination: { limit: 10 }) { _id title count } }",
    });

    // Helper to seed up to a target count
    const seedUpTo = async (targetCount: number) => {
      const needed = targetCount - createdIds.length;
      if (needed <= 0) return;

      let nextIndex = createdIds.length;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (true) {
            const i = nextIndex++;
            if (i >= targetCount) break;
            try {
              const res = await fetch(collectionUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(seedArticlePayload(i, runId)),
              });
              if (res.ok) {
                const json = (await res.json()) as { data?: { _id?: string; id?: string } };
                const id = json?.data?._id || json?.data?.id;
                if (id) createdIds.push(String(id));
              }
            } catch {}
          }
        }),
      );
    };

    interface StepMetric {
      step: number;
      findByIdRandomRps: number;
      findByIdRandomAvgMs: number;
      listFilterSortRps: number;
      listFilterSortAvgMs: number;
      graphqlRps: number;
      graphqlAvgMs: number;
      createRps: number;
      createAvgMs: number;
    }

    const stepMetrics: StepMetric[] = [];
    let createCursor = 0;

    for (const step of TARGET_STEPS) {
      logger.info(`\n📊 [SCALE STEP: ${step.toLocaleString()} rows] Seeding and measuring...`);
      await seedUpTo(step);
      await stabilize(200);

      const idCount = createdIds.length || 1;
      const stableId = createdIds[0] || "20000000-0000-4000-8000-000000000001";

      // 1. Uniform Random PK Lookup
      const findByIdRandom = async () => {
        const randomIndex = Math.floor(Math.random() * idCount);
        const targetId = createdIds[randomIndex] || stableId;
        const res = await fetch(`${collectionUrl}/${targetId}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.arrayBuffer();
      };

      // 2. Filtered & Sorted List Query
      const filterQuery = encodeURIComponent(JSON.stringify({ status: "published" }));
      const listFilterUrl = `${collectionUrl}?limit=20&filter=${filterQuery}&sort=-count`;
      const listFilterSort = async () => {
        const res = await fetch(listFilterUrl, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.arrayBuffer();
      };

      // 3. GraphQL Root Resolver Query
      const graphql = async () => {
        const res = await fetch(gqlUrl, { method: "POST", headers, body: gqlBody });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.arrayBuffer();
      };

      // 4. Create Write-Lane Mutation
      const create = async () => {
        const seq = createCursor++;
        const payload = JSON.stringify({
          title: `Write bench entry ${seq}`,
          slug: `scale-bench-write-${runId}-${seq}`,
          status: "draft",
          count: seq,
          publishDate: "2026-01-01T00:00:00.000Z",
          content: "Scale spectrum test entry.",
        });
        const res = await fetch(collectionUrl, { method: "POST", headers, body: payload });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.arrayBuffer();
      };

      const resFind = await runBenchmark({
        name: `findByIdRandom @ ${step}`,
        iterations: ITERS_PER_STEP,
        warmupIterations: WARMUP_ITERS,
        concurrency: CONCURRENCY,
        onIteration: findByIdRandom,
        silent: true,
      });

      const resList = await runBenchmark({
        name: `listFilterSort @ ${step}`,
        iterations: ITERS_PER_STEP,
        warmupIterations: WARMUP_ITERS,
        concurrency: CONCURRENCY,
        onIteration: listFilterSort,
        silent: true,
      });

      const resGql = await runBenchmark({
        name: `graphql @ ${step}`,
        iterations: ITERS_PER_STEP,
        warmupIterations: WARMUP_ITERS,
        concurrency: CONCURRENCY,
        onIteration: graphql,
        silent: true,
      });

      const resCreate = await runBenchmark({
        name: `create @ ${step}`,
        iterations: Math.min(ITERS_PER_STEP, 50),
        warmupIterations: 10,
        concurrency: Math.min(CONCURRENCY, 4),
        onIteration: create,
        silent: true,
      });

      stepMetrics.push({
        step,
        findByIdRandomRps: Math.round(resFind.rps),
        findByIdRandomAvgMs: +resFind.avgMs.toFixed(3),
        listFilterSortRps: Math.round(resList.rps),
        listFilterSortAvgMs: +resList.avgMs.toFixed(3),
        graphqlRps: Math.round(resGql.rps),
        graphqlAvgMs: +resGql.avgMs.toFixed(3),
        createRps: Math.round(resCreate.rps),
        createAvgMs: +resCreate.avgMs.toFixed(3),
      });

      logger.info(
        `  ↳ ${String(step).padStart(6)} rows: findById ${resFind.rps.toFixed(0)} RPS (${resFind.avgMs.toFixed(2)}ms) | list ${resList.rps.toFixed(0)} RPS (${resList.avgMs.toFixed(2)}ms) | gql ${resGql.rps.toFixed(0)} RPS | write ${resCreate.rps.toFixed(0)} RPS`,
      );
    }

    // ── SUMMARY TRUTH TABLE & CLIFF REPORT ─────────────────────────────────
    console.log("\n" + "═".repeat(98));
    console.log(
      ` SCALE SPECTRUM DEGRADATION MATRIX (${dbType} — 1 to ${TARGET_STEPS[TARGET_STEPS.length - 1]} Rows)`,
    );
    console.log("═".repeat(98));
    console.log(
      " Scale       │ findByIdRandom        │ listFilterSort        │ GraphQL               │ Create (Write Lane) ",
    );
    console.log("─".repeat(98));

    const baseline = stepMetrics[0];

    for (const m of stepMetrics) {
      const stepStr = `${m.step.toLocaleString()} rows`.padEnd(11);
      const findStr =
        `${String(m.findByIdRandomRps).padStart(5)} RPS (${m.findByIdRandomAvgMs}ms)`.padEnd(21);
      const listStr =
        `${String(m.listFilterSortRps).padStart(5)} RPS (${m.listFilterSortAvgMs}ms)`.padEnd(21);
      const gqlStr = `${String(m.graphqlRps).padStart(5)} RPS (${m.graphqlAvgMs}ms)`.padEnd(21);
      const createStr = `${String(m.createRps).padStart(5)} RPS (${m.createAvgMs}ms)`;

      console.log(` ${stepStr} │ ${findStr} │ ${listStr} │ ${gqlStr} │ ${createStr}`);
    }
    console.log("═".repeat(98));

    // Degradation factor analysis
    const largest = stepMetrics[stepMetrics.length - 1];
    if (baseline && largest && baseline !== largest) {
      console.log(
        "\n📊 SCALE DEGRADATION RATIO (1 row vs " + largest.step.toLocaleString() + " rows):",
      );
      console.log(
        `  • findByIdRandom: ${(baseline.findByIdRandomAvgMs / largest.findByIdRandomAvgMs).toFixed(2)}x throughput retention (${baseline.findByIdRandomRps} → ${largest.findByIdRandomRps} RPS)`,
      );
      console.log(
        `  • listFilterSort: ${(baseline.listFilterSortAvgMs / largest.listFilterSortAvgMs).toFixed(2)}x throughput retention (${baseline.listFilterSortRps} → ${largest.listFilterSortRps} RPS)`,
      );
      console.log(
        `  • GraphQL:        ${(baseline.graphqlAvgMs / largest.graphqlAvgMs).toFixed(2)}x throughput retention (${baseline.graphqlRps} → ${largest.graphqlRps} RPS)`,
      );
      console.log(
        `  • Create (Write): ${(baseline.createAvgMs / largest.createAvgMs).toFixed(2)}x throughput retention (${baseline.createRps} → ${largest.createRps} RPS)`,
      );
      console.log("═".repeat(98) + "\n");
    }

    exportMetric("scale_spectrum.largest_step", largest.step, "rows");
    exportMetric("scale_spectrum.find_by_id_final_rps", largest.findByIdRandomRps, "req/s");
    exportMetric("scale_spectrum.list_final_rps", largest.listFilterSortRps, "req/s");
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
    }
  }
}, 300_000);
