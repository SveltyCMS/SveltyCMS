/**
 * @file tests/benchmarks/competitive-workload-replica.test.ts
 * @description Competitive workload replica — same protocol as the external harness.
 * @summary Seq + concurrent (8 workers), harness iteration counts, median of N rounds.
 *
 * ### Features:
 * - Sequential and concurrent phases (harness `run.mjs` contract)
 * - Same 10 workloads, same mixed cycle (6 read / 2 write / 2 GraphQL)
 * - listLarge limit 100, GraphQL measured before writes
 * - CSRF cookie + Origin + X-CSRF-Token (production auth)
 *
 * ### Protocol (aligned with D:/sveltycms-benchmark, not identical environment)
 * Defaults keep CI tractable (`BENCH_DOCS=500`, `BENCH_ROUNDS=1`). To match the
 * headline harness row: `BENCH_DOCS=10000 BENCH_ROUNDS=3`.
 *
 * Concurrent RPS is the number to quote against Payload/Directus/Strapi.
 * Sequential avg is the per-request floor; 8-worker RPS cannot exceed 8 / seq_s.
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
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
const createdIds: string[] = [];

/** Harness iteration counts (`src/workloads.mjs` ITERATIONS). */
const ITERATIONS: Record<string, number> = {
  findById: 500,
  findByIdRandom: 500,
  listFilterSort: 200,
  listLarge: 200,
  listPlain: 200,
  findMissing: 200,
  graphql: 200,
  create: 100,
  update: 100,
  mixed: 200,
};

const WARMUP = 50;
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY) || 8;
const ROUNDS = Math.max(1, Number(process.env.BENCH_ROUNDS) || 1);
const DEEP_WARMUP = Number(process.env.BENCH_DEEP_WARMUP || 250);
const DEEP_WARMUP_WRITES = Number(process.env.BENCH_DEEP_WARMUP_WRITES || 150);

const MIX_CYCLE = [
  "findByIdRandom",
  "listFilterSort",
  "findByIdRandom",
  "create",
  "findByIdRandom",
  "update",
  "listLarge",
  "findByIdRandom",
  "graphql",
  "graphql",
] as const;

function seedArticlePayload(i: number, runId: string) {
  return {
    title: `Scaling headless CMS for enterprise — Part ${i}`,
    slug: `bench-article-${runId}-${i}`,
    status: i % 3 === 0 ? "draft" : "published",
    count: i * 10,
    publishDate: new Date().toISOString(),
    content: `# Article ${i}\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. `.repeat(
      12,
    ),
  };
}

function createWorkloadPayload(seq: number, runId: string) {
  return {
    _id: crypto.randomUUID(),
    title: "Benchmark create workload",
    slug: `bench-create-${runId}-${seq}`,
    status: "draft",
    count: 0,
    publishDate: new Date().toISOString(),
    content: "Created by the comparative benchmark harness.",
  };
}

test("Competitive 9-Workload Replica Benchmark", async () => {
  logger.info(
    `🚀 Competitive replica: ${CONCURRENCY}c, ${ROUNDS} round(s), seq+con (harness protocol)...`,
  );

  const serverInfo = await setupBenchmarkServer();
  stopServer = serverInfo.stop;
  baseUrl = serverInfo.baseUrl;
  const headers = {
    ...benchmarkAuthHeaders(),
    "content-type": "application/json",
    "x-test-security": "true",
  };
  const dbType = getDbType();
  const runId = crypto.randomUUID().slice(0, 8);
  const SEED_COUNT = Number(process.env.BENCH_DOCS) || 500;
  const gqlBody = JSON.stringify({
    query: "query { BenchmarkStable(pagination: { limit: 10 }) { _id title count } }",
  });
  const listFilterUrl = `${baseUrl}/api/collections/BenchmarkStable?limit=20&filter=${encodeURIComponent(JSON.stringify({ status: "published" }))}&sort=-count`;
  const listLargeUrl = `${baseUrl}/api/collections/BenchmarkStable?limit=100&filter=${encodeURIComponent(JSON.stringify({ status: "published" }))}&sort=-count`;
  const listPlainUrl = `${baseUrl}/api/collections/BenchmarkStable?limit=10`;
  const missingId = `bench-missing-${runId}`;

  logger.info(
    `   → Pre-seeding ${SEED_COUNT} records with harness-shaped payloads (${CONCURRENCY} seeders)...`,
  );
  let seedCursor = 0;
  const seedWorkers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const i = seedCursor++;
      if (i >= SEED_COUNT) return;
      try {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable`, {
          method: "POST",
          headers,
          body: JSON.stringify(seedArticlePayload(i, runId)),
        });
        if (res.ok) {
          const json = (await res.json()) as { data?: { _id?: string; id?: string } };
          const id = json?.data?._id || json?.data?.id;
          if (id) createdIds.push(String(id));
        }
      } catch {
        // non-fatal
      }
    }
  });
  await Promise.all(seedWorkers);
  logger.info(`   ✅ Pre-seeded ${createdIds.length}/${SEED_COUNT} records.`);

  const stableId = createdIds[0] || "20000000-0000-4000-8000-000000000001";
  let updateIdx = 0;
  let createSeq = 0;
  let randomIdx = 0;
  let mixedIdx = 0;

  const findById = async () => {
    const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${stableId}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
  };
  const findByIdRandom = async () => {
    const id = createdIds[randomIdx++ % createdIds.length] || stableId;
    const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${id}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
  };
  const listPlain = async () => {
    const res = await fetch(listPlainUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
  };
  const listFilterSort = async () => {
    const res = await fetch(listFilterUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
  };
  const listLarge = async () => {
    const res = await fetch(listLargeUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
  };
  const findMissing = async () => {
    const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${missingId}`, { headers });
    if (res.status !== 404 && !res.ok) throw new Error(`Unexpected HTTP ${res.status}`);
    await res.text();
  };
  const graphql = async () => {
    const res = await fetch(`${baseUrl}/api/graphql`, {
      method: "POST",
      headers,
      body: gqlBody,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { BenchmarkStable?: unknown[] } };
    if (!Array.isArray(body?.data?.BenchmarkStable) || body.data.BenchmarkStable.length === 0) {
      throw new Error(`GraphQL BenchmarkStable returned 0 rows: ${JSON.stringify(body)}`);
    }
  };
  const create = async () => {
    const seq = createSeq++;
    const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable`, {
      method: "POST",
      headers,
      body: JSON.stringify(createWorkloadPayload(seq, runId)),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
  };
  const update = async () => {
    const targetId = createdIds[updateIdx++ % createdIds.length] || stableId;
    const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/${targetId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ count: (updateIdx % 1000) + 1 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
  };
  const handlers: Record<string, () => Promise<void>> = {
    findById,
    findByIdRandom,
    listPlain,
    listFilterSort,
    listLarge,
    findMissing,
    graphql,
    create,
    update,
  };
  const mixed = async () => {
    const op = MIX_CYCLE[mixedIdx++ % MIX_CYCLE.length];
    await handlers[op]();
  };
  handlers.mixed = mixed;

  const workloads: { shortLabel: string; fn: () => Promise<void> }[] = [
    { shortLabel: "findById", fn: findById },
    { shortLabel: "findByIdRandom", fn: findByIdRandom },
    { shortLabel: "listFilterSort", fn: listFilterSort },
    { shortLabel: "listLarge", fn: listLarge },
    { shortLabel: "listPlain", fn: listPlain },
    { shortLabel: "findMissing", fn: findMissing },
    { shortLabel: "graphql", fn: graphql },
    { shortLabel: "create", fn: create },
    { shortLabel: "update", fn: update },
    { shortLabel: "mixed", fn: mixed },
  ];

  if (DEEP_WARMUP + DEEP_WARMUP_WRITES > 0) {
    logger.info(
      `   → Deep JIT warmup: ${DEEP_WARMUP} reads+GQL + ${DEEP_WARMUP_WRITES} writes (discarded)`,
    );
    const readFns = [findById, listPlain, listFilterSort, findMissing, graphql];
    let w = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (true) {
          const i = w++;
          if (i >= DEEP_WARMUP) return;
          try {
            await readFns[i % readFns.length]();
          } catch {
            /* discarded */
          }
        }
      }),
    );
    const writeFns = [create, update];
    let w2 = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (true) {
          const i = w2++;
          if (i >= DEEP_WARMUP_WRITES) return;
          try {
            await writeFns[i % writeFns.length]();
          } catch {
            /* discarded */
          }
        }
      }),
    );
  }

  const results: any[] = [];

  const pickMedianRound = (rounds: { seq: any; con: any }[]): { seq: any; con: any } => {
    if (rounds.length === 1) return rounds[0];
    const sorted = [...rounds].sort((a, b) => b.con.rps - a.con.rps || a.seq.avgMs - b.seq.avgMs);
    return sorted[Math.floor(sorted.length / 2)];
  };

  for (const w of workloads) {
    await stabilize();
    logger.info(`   → Testing ${w.shortLabel} (seq + ${CONCURRENCY}c, ${ROUNDS} round(s))...`);
    const iters = ITERATIONS[w.shortLabel] || 100;
    const rounds: { seq: any; con: any }[] = [];

    for (let r = 0; r < ROUNDS; r++) {
      const seq = await runBenchmark({
        name: `${w.shortLabel} (Sequential)`,
        warmupIterations: r === 0 ? WARMUP : 0,
        iterations: iters,
        concurrency: 1,
        onIteration: w.fn,
      });
      const con = await runBenchmark({
        name: `${w.shortLabel} (Concurrent ${CONCURRENCY}c)`,
        warmupIterations: 0,
        iterations: iters,
        concurrency: CONCURRENCY,
        onIteration: w.fn,
      });
      rounds.push({ seq, con });
    }

    const chosen = pickMedianRound(rounds);
    results.push({ ...chosen.seq, shortLabel: `${w.shortLabel}.seq` });
    results.push({ ...chosen.con, shortLabel: w.shortLabel });
    exportResult(chosen.seq);
    exportResult(chosen.con);
  }

  printTruthTable({
    title: `COMPETITIVE HARNESS REPLICA (${dbType.toUpperCase()} — ${createdIds.length} Docs, ${ROUNDS} round(s))`,
    subtitle: `Seq + ${CONCURRENCY}c, harness iteration counts, GraphQL pre-write, mixed 6/2/2. Concurrent RPS is the competitive figure.`,
    results,
  });

  const summaryMetrics = results
    .filter((r) => !String(r.shortLabel).endsWith(".seq"))
    .map((r) => ({
      key: r.shortLabel || r.name,
      val: r.rps.toFixed(1),
      unit: "RPS",
    }));

  printSummaryTable(summaryMetrics, "Competitive");

  const findByIdRes = results.find((r) => r.shortLabel === "findById");
  const listPlainRes = results.find((r) => r.shortLabel === "listPlain");
  const gqlRes = results.find((r) => r.shortLabel === "graphql");
  const createRes = results.find((r) => r.shortLabel === "create");
  const updateRes = results.find((r) => r.shortLabel === "update");

  if (findByIdRes) exportMetric("competitive.find_by_id.rps", findByIdRes.rps, "req/s");
  if (listPlainRes) exportMetric("competitive.list_plain.rps", listPlainRes.rps, "req/s");
  if (gqlRes) exportMetric("competitive.graphql.rps", gqlRes.rps, "req/s");
  if (createRes) exportMetric("competitive.create.rps", createRes.rps, "req/s");
  if (updateRes) exportMetric("competitive.update.rps", updateRes.rps, "req/s");

  if (stopServer) {
    await stopServer();
    stopServer = null;
  }
}, 300_000);
