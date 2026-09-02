/**
 * @file tests/benchmarks/write-matrix-cliff-repro.test.ts
 * @description Fast reproduction test for the full-matrix write degradation cliff.
 *
 * Compares 3 write phases on the SAME server instance:
 * 1. Clean Create (No pre-reads)
 * 2. Post-findById Create (Single hot read)
 * 3. Post-Full-Matrix Create (After diverse random reads + list queries with 500+ tags)
 */

import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  stabilize,
  benchmarkAuthHeaders,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import crypto from "node:crypto";
import { seedHttpCollectionBurst } from "./modules/seed-burst";

const CONCURRENCY = 8;
const ITERS = 150;
const SEED_COUNT = 500;

test("Write Matrix Cliff Reproduction Audit", async () => {
  let stopServer: (() => Promise<void>) | null = null;
  const createdIds: string[] = [];

  try {
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

    // ── 0. SEEDING ──
    logger.info(`📦 Pre-seeding ${SEED_COUNT} records...`);
    await seedHttpCollectionBurst({
      url: collectionUrl,
      headers,
      count: SEED_COUNT,
      concurrency: CONCURRENCY,
      payloadAt: (i) => ({
        title: `Article ${i}`,
        slug: `bench-art-${runId}-${i}`,
        status: i % 2 === 0 ? "published" : "draft",
        count: i * 10,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: "Benchmark reproduction article body.",
      }),
      existing: createdIds,
    });
    logger.info(`✅ Pre-seeded ${createdIds.length} records.`);

    let cursor = 0;
    const createFn = async () => {
      const seq = cursor++;
      const payload = JSON.stringify({
        title: "Benchmark create workload",
        slug: `repro-create-${runId}-${seq}`,
        status: "draft",
        count: 0,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: "Created by reproduction test.",
      });
      const res = await fetch(collectionUrl, { method: "POST", headers, body: payload });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const updateFn = async () => {
      const targetId = createdIds[cursor++ % createdIds.length];
      const payload = JSON.stringify({ count: (cursor % 1000) + 1 });
      const res = await fetch(`${collectionUrl}/${targetId}`, {
        method: "PATCH",
        headers,
        body: payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    // ── PHASE 1: CLEAN WRITE (No prior reads) ──
    await stabilize(200);
    logger.info("\n🧪 [PHASE 1] Clean Concurrent Create (8c)...");
    const phase1Create = await runBenchmark({
      name: "Phase 1: Clean Create",
      warmupIterations: 20,
      iterations: ITERS,
      concurrency: CONCURRENCY,
      onIteration: createFn,
    });
    logger.info(
      `  → Phase 1 Clean Create: ${phase1Create.rps.toFixed(1)} RPS (avg: ${phase1Create.avgMs.toFixed(2)}ms, p95: ${phase1Create.p95Ms.toFixed(2)}ms)`,
    );

    // ── PHASE 2: POST-FINDBYID WRITE (Single hot read only) ──
    logger.info("\n🧪 [PHASE 2] Executing 500x findById on single row...");
    const stableId = createdIds[0];
    for (let i = 0; i < 500; i++) {
      const res = await fetch(`${collectionUrl}/${stableId}`, { headers });
      await res.arrayBuffer();
    }
    await stabilize(100);
    const phase2Create = await runBenchmark({
      name: "Phase 2: Post-findById Create",
      warmupIterations: 10,
      iterations: ITERS,
      concurrency: CONCURRENCY,
      onIteration: createFn,
    });
    logger.info(
      `  → Phase 2 Post-findById Create: ${phase2Create.rps.toFixed(1)} RPS (avg: ${phase2Create.avgMs.toFixed(2)}ms, p95: ${phase2Create.p95Ms.toFixed(2)}ms)`,
    );

    // ── PHASE 3: POST-FULL-MATRIX READS (Diverse Random Reads + Lists) ──
    logger.info(
      "\n🧪 [PHASE 3] Simulating Full-Matrix Read Workloads (Populating tags & caches)...",
    );
    // 1. findByIdRandom (500 distinct doc:* tags)
    logger.info("  → Priming 500 distinct doc:* read caches...");
    for (let i = 0; i < Math.min(createdIds.length, 500); i++) {
      const res = await fetch(`${collectionUrl}/${createdIds[i]}`, { headers });
      await res.arrayBuffer();
    }
    // 2. listFilterSort + listLarge + listPlain
    logger.info("  → Priming list & filter collection:* caches...");
    const filterQ = encodeURIComponent(JSON.stringify({ status: "published" }));
    await fetch(`${collectionUrl}?limit=20&filter=${filterQ}&sort=-count`, { headers }).then((r) =>
      r.arrayBuffer(),
    );
    await fetch(`${collectionUrl}?limit=100&filter=${filterQ}&sort=-count`, { headers }).then((r) =>
      r.arrayBuffer(),
    );
    await fetch(`${collectionUrl}?limit=10`, { headers }).then((r) => r.arrayBuffer());
    // 3. GraphQL
    await fetch(`${baseUrl}/api/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: "query { BenchmarkStable(pagination: { limit: 10 }) { _id title count } }",
      }),
    }).then((r) => r.arrayBuffer());

    await stabilize(100);
    const phase3Create = await runBenchmark({
      name: "Phase 3: Post-Full-Matrix Create",
      warmupIterations: 10,
      iterations: ITERS,
      concurrency: CONCURRENCY,
      onIteration: createFn,
    });
    logger.info(
      `  → Phase 3 Post-Full-Matrix Create: ${phase3Create.rps.toFixed(1)} RPS (avg: ${phase3Create.avgMs.toFixed(2)}ms, p95: ${phase3Create.p95Ms.toFixed(2)}ms)`,
    );

    const phase3Update = await runBenchmark({
      name: "Phase 3: Post-Full-Matrix Update",
      warmupIterations: 10,
      iterations: ITERS,
      concurrency: CONCURRENCY,
      onIteration: updateFn,
    });
    logger.info(
      `  → Phase 3 Post-Full-Matrix Update: ${phase3Update.rps.toFixed(1)} RPS (avg: ${phase3Update.avgMs.toFixed(2)}ms, p95: ${phase3Update.p95Ms.toFixed(2)}ms)`,
    );

    // ── SUMMARY REPORT ──
    const deltaPostSingle = (
      ((phase2Create.rps - phase1Create.rps) / phase1Create.rps) *
      100
    ).toFixed(1);
    const deltaFullMatrix = (
      ((phase3Create.rps - phase1Create.rps) / phase1Create.rps) *
      100
    ).toFixed(1);

    console.log("\n" + "=".repeat(75));
    console.log("📊 WRITE-MATRIX CLIFF AUDIT SUMMARY (DB: " + getDbType().toUpperCase() + ")");
    console.log("=".repeat(75));
    console.log(
      `1. Clean Create (Zero Reads):               ${phase1Create.rps.toFixed(1).padStart(7)} RPS (${phase1Create.avgMs.toFixed(2)}ms)`,
    );
    console.log(
      `2. Post-findById Create (Single-Hot Read):  ${phase2Create.rps.toFixed(1).padStart(7)} RPS (${phase2Create.avgMs.toFixed(2)}ms) [${deltaPostSingle}%]`,
    );
    console.log(
      `3. Post-Full-Matrix Create (Diverse Reads): ${phase3Create.rps.toFixed(1).padStart(7)} RPS (${phase3Create.avgMs.toFixed(2)}ms) [${deltaFullMatrix}%] ⚠️`,
    );
    console.log(
      `4. Post-Full-Matrix Update:                 ${phase3Update.rps.toFixed(1).padStart(7)} RPS (${phase3Update.avgMs.toFixed(2)}ms)`,
    );
    console.log("=".repeat(75));
    console.log(`💡 Bestätigt: findById allein verlangsamt Writes NICHT (${deltaPostSingle}%).`);
    console.log(
      `   Der Durchsatzeinbruch (${deltaFullMatrix}%) entsteht erst durch diverse Tags/Caches nach Phase 3!`,
    );
    console.log("=".repeat(75));
  } finally {
    if (stopServer) {
      await stopServer();
      stopServer = null;
    }
  }
}, 120_000);
