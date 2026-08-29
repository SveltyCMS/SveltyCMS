/**
 * @file tests/benchmarks/competitive-workload-replica.test.ts
 * @description Competitive workload replica — same protocol as the external harness.
 * @summary Seq + concurrent (8 workers), harness iteration counts, median of N rounds.
 *
 * ### Features:
 * - Sequential and concurrent phases (harness `run.mjs` contract)
 * - Same 10 workloads, same mixed cycle (6 read / 2 write / 2 GraphQL)
 * - listLarge limit 100, harness workload order (writes before GraphQL)
 * - CSRF cookie + Origin + X-CSRF-Token (production auth)
 * - Low-overhead stream draining (`res.arrayBuffer()`) and pre-encoded URL paths
 * - Full try...finally process lifecycle guard
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

const ITERATIONS: Record<string, number> = {
  findById: 500,
  findByIdRandom: 500,
  listFilterSort: 200,
  listLarge: 200,
  listPlain: 200,
  findMissing: 200,
  graphql: 200,
  create: 300,
  update: 300,
  mixed: 200,
};

const WARMUP = 50;
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY) || 8;
// Protocol parity with the external harness (run.mjs): adaptive rounds with a
// MEDIAN point estimate. BENCH_ROUNDS=N forces a fixed round count (CI smoke).
const FIXED_ROUNDS = Number(process.env.BENCH_ROUNDS) || 0;
const MIN_ROUNDS = Math.max(1, Number(process.env.BENCH_MIN_ROUNDS) || 3);
const MAX_ROUNDS = Math.max(MIN_ROUNDS, Number(process.env.BENCH_MAX_ROUNDS) || 7);
const COV_STOP = Number(process.env.BENCH_COV_STOP) || 4;
const ROUND_LIMIT = FIXED_ROUNDS > 0 ? FIXED_ROUNDS : MAX_ROUNDS;
// Opt-in steady-state soak (write-neutral daily mix) — BENCH_SOAK_SECONDS=60.
const SOAK_SECONDS = Number(process.env.BENCH_SOAK_SECONDS) || 0;
const DEEP_WARMUP = Number(process.env.BENCH_DEEP_WARMUP || 250);
const DEEP_WARMUP_WRITES = Number(process.env.BENCH_DEEP_WARMUP_WRITES || 150);
const SEED_COUNT = Number(process.env.BENCH_DOCS) || 500;

const gcSync = async () => {
  if (typeof globalThis.gc === "function") globalThis.gc();
  return new Promise((r) => setTimeout(r, 200));
};

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

// Write-neutral soak mix (harness `mixed-stable`): same 6/2/2 shape, but the
// create is patched onto an existing row so the dataset size stays constant.
const MIX_STABLE_CYCLE = MIX_CYCLE.map((op) => (op === "create" ? "update" : op));

function seedArticlePayload(i: number, runId: string) {
  return {
    title: `Scaling headless CMS for enterprise — Part ${i}`,
    slug: `bench-article-${runId}-${i}`,
    status: i % 3 === 0 ? "draft" : "published",
    count: i * 10,
    publishDate: "2026-01-01T00:00:00.000Z",
    content: `# Article ${i}\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. `.repeat(
      12,
    ),
  };
}

test("Competitive 9-Workload Replica Benchmark", async () => {
  let stopServer: (() => Promise<void>) | null = null;
  const createdIds: string[] = [];

  try {
    logger.info(
      `🚀 Competitive replica: ${CONCURRENCY}c, up to ${ROUND_LIMIT} round(s), seq+con...`,
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

    const dbType = getDbType();
    const runId = crypto.randomUUID().slice(0, 8);

    // ── PRE-COMPUTED URLS & STATIC PAYLOADS ──────────────────────────────
    const gqlBody = JSON.stringify({
      query: "query { BenchmarkStable(pagination: { limit: 10 }) { _id title count } }",
    });
    const filterQuery = encodeURIComponent(JSON.stringify({ status: "published" }));
    const listFilterUrl = `${baseUrl}/api/collections/BenchmarkStable?limit=20&filter=${filterQuery}&sort=-count`;
    const listLargeUrl = `${baseUrl}/api/collections/BenchmarkStable?limit=100&filter=${filterQuery}&sort=-count`;
    const listPlainUrl = `${baseUrl}/api/collections/BenchmarkStable?limit=10`;
    const collectionUrl = `${baseUrl}/api/collections/BenchmarkStable`;
    const missingUrl = `${baseUrl}/api/collections/BenchmarkStable/bench-missing-${runId}`;

    // ── HIGH-THROUGHPUT PRE-SEEDING ──────────────────────────────────────
    logger.info(`  → Pre-seeding ${SEED_COUNT} records (${CONCURRENCY} workers)...`);
    let seedIndex = 0;

    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (true) {
          const i = seedIndex++;
          if (i >= SEED_COUNT) break;
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
          } catch {
            // non-fatal
          }
        }
      }),
    );
    logger.info(`  ✅ Pre-seeded ${createdIds.length}/${SEED_COUNT} records.`);

    const stableId = createdIds[0] || "20000000-0000-4000-8000-000000000001";
    const idCount = createdIds.length || 1;

    // ── WORKLOAD HANDLERS (Minimal In-Loop Overhead) ──────────────────────
    let cursor = 0;

    const findById = async () => {
      const res = await fetch(`${collectionUrl}/${stableId}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const findByIdRandom = async () => {
      const targetId = createdIds[cursor++ % idCount] || stableId;
      const res = await fetch(`${collectionUrl}/${targetId}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const listPlain = async () => {
      const res = await fetch(listPlainUrl, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const listFilterSort = async () => {
      const res = await fetch(listFilterUrl, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const listLarge = async () => {
      const res = await fetch(listLargeUrl, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const findMissing = async () => {
      const res = await fetch(missingUrl, { headers });
      if (res.status !== 404 && !res.ok) throw new Error(`Unexpected HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const graphql = async () => {
      const res = await fetch(`${baseUrl}/api/graphql`, { method: "POST", headers, body: gqlBody });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: { BenchmarkStable?: unknown[] } };
      if (!body?.data?.BenchmarkStable?.length) {
        throw new Error(`GraphQL returned 0 rows: ${JSON.stringify(body)}`);
      }
    };

    const create = async () => {
      const seq = cursor++;
      const payload = JSON.stringify({
        title: "Benchmark create workload",
        slug: `bench-create-${runId}-${seq}`,
        status: "draft",
        count: 0,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: "Created by the comparative benchmark harness.",
      });
      const res = await fetch(collectionUrl, { method: "POST", headers, body: payload });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const update = async () => {
      const targetId = createdIds[cursor++ % idCount] || stableId;
      const payload = JSON.stringify({ count: (cursor % 1000) + 1 });
      const res = await fetch(`${collectionUrl}/${targetId}`, {
        method: "PATCH",
        headers,
        body: payload,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
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
      const op = MIX_CYCLE[cursor++ % MIX_CYCLE.length];
      await handlers[op]();
    };
    handlers.mixed = mixed;

    // Write-neutral soak mix (harness `mixed-stable`) — dataset size held constant.
    const mixedStable = async () => {
      const op = MIX_STABLE_CYCLE[cursor++ % MIX_STABLE_CYCLE.length];
      await handlers[op]();
    };
    handlers.mixedStable = mixedStable;

    // Same order as the external harness (run.mjs WORKLOADS): writes before
    // GraphQL so the measured GraphQL list root reflects the post-write state.
    const workloads = [
      { shortLabel: "findById", fn: findById },
      { shortLabel: "findByIdRandom", fn: findByIdRandom },
      { shortLabel: "listFilterSort", fn: listFilterSort },
      { shortLabel: "listLarge", fn: listLarge },
      { shortLabel: "listPlain", fn: listPlain },
      { shortLabel: "findMissing", fn: findMissing },
      { shortLabel: "create", fn: create },
      { shortLabel: "update", fn: update },
      { shortLabel: "graphql", fn: graphql },
      { shortLabel: "mixed", fn: mixed },
    ];

    // ── PHASE 1: COLD EXECUTION (0 Warmup) ───────────────────────────────
    logger.info(`\n❄️  [PHASE 1] Measuring COLD throughput...`);
    const coldResults: any[] = [];
    for (const w of workloads) {
      const iters = Math.min(ITERATIONS[w.shortLabel] || 100, 100);
      const seq = await runBenchmark({
        name: `${w.shortLabel} (Cold Sequential)`,
        warmupIterations: 0,
        iterations: iters,
        concurrency: 1,
        onIteration: w.fn,
      });
      const con = await runBenchmark({
        name: `${w.shortLabel} (Cold Concurrent ${CONCURRENCY}c)`,
        warmupIterations: 0,
        iterations: iters,
        concurrency: CONCURRENCY,
        onIteration: w.fn,
      });
      coldResults.push({ ...seq, shortLabel: `${w.shortLabel}.cold.seq` });
      coldResults.push({ ...con, shortLabel: `${w.shortLabel}.cold` });
    }

    // ── PHASE 2: DEEP JIT WARMUP ─────────────────────────────────────────
    if (DEEP_WARMUP + DEEP_WARMUP_WRITES > 0) {
      logger.info(
        `\n🔥 [PHASE 2] Deep JIT warmup: ${DEEP_WARMUP} reads + ${DEEP_WARMUP_WRITES} writes...`,
      );
      const readOps = [findById, listPlain, listFilterSort, findMissing, graphql];
      let rIdx = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (rIdx++ < DEEP_WARMUP) {
            try {
              await readOps[rIdx % readOps.length]();
            } catch {}
          }
        }),
      );
      let wIdx = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (wIdx++ < DEEP_WARMUP_WRITES) {
            try {
              await (wIdx % 2 === 0 ? create() : update());
            } catch {}
          }
        }),
      );
    }

    // ── PHASE 3: WARM EXECUTION (Steady-State JIT-Warmed) ──────────────────
    // Harness protocol parity (run.mjs): per-workload WARMUP → round 1 runs
    // immediately; gcSync() + 200ms cooldown ONLY between rounds (never before
    // a workload), so a server-side idle GC lands in the cooldown and the next
    // round measures the WARM steady state. Adaptive rounds: at least
    // MIN_ROUNDS, stop when CoV(con RPS) < COV_STOP, cap MAX_ROUNDS; the
    // MEDIAN round is the point estimate. BENCH_ROUNDS=N forces a fixed count.
    logger.info(
      `\n🚀 [PHASE 3] Measuring WARM steady-state (up to ${ROUND_LIMIT} rounds, ${WARMUP} warmup)...`,
    );
    const warmResults: any[] = [];

    const covPct = (vals: number[]) => {
      const v = vals.filter((x) => Number.isFinite(x) && x > 0);
      if (v.length < 2) return 0;
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      if (mean === 0) return 0;
      const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
      return +((Math.sqrt(variance) / mean) * 100).toFixed(2);
    };

    const pickMedianRound = (rounds: { seq: any; con: any }[]) => {
      if (rounds.length === 1) return rounds[0];
      const sorted = [...rounds].sort((a, b) => b.con.rps - a.con.rps || a.seq.avgMs - b.seq.avgMs);
      return sorted[Math.floor(sorted.length / 2)];
    };

    // One-time settle after the deep-warmup burst (memory snapshot + Windows
    // file-handle jitter), then the harness protocol runs workloads back-to-back.
    await stabilize();

    for (const w of workloads) {
      const iters = ITERATIONS[w.shortLabel] || 100;
      const rounds: { seq: any; con: any }[] = [];

      for (let r = 0; r < ROUND_LIMIT; r++) {
        const seq = await runBenchmark({
          name: `${w.shortLabel} (Warm Sequential)`,
          warmupIterations: r === 0 ? WARMUP : 0,
          iterations: iters,
          concurrency: 1,
          onIteration: w.fn,
        });
        const con = await runBenchmark({
          name: `${w.shortLabel} (Warm Concurrent ${CONCURRENCY}c)`,
          warmupIterations: 0,
          iterations: iters,
          concurrency: CONCURRENCY,
          onIteration: w.fn,
        });
        rounds.push({ seq, con });

        // Noise-adaptive stop (harness protocol): at least MIN_ROUNDS, then
        // stop once the round-to-round spread of concurrent RPS is < COV_STOP.
        if (FIXED_ROUNDS === 0) {
          const covCon = covPct(rounds.map((x) => x.con.rps));
          if (rounds.length >= MIN_ROUNDS && covCon < COV_STOP) break;
          // gcSync only BETWEEN rounds — the final measured round runs as-is.
          if (rounds.length < ROUND_LIMIT) await gcSync();
        }
      }

      const chosen = pickMedianRound(rounds);
      warmResults.push({ ...chosen.seq, shortLabel: `${w.shortLabel}.seq` });
      warmResults.push({ ...chosen.con, shortLabel: w.shortLabel });
      exportResult(chosen.seq);
      exportResult(chosen.con);
      logger.info(
        `  ⚡ ${w.shortLabel.padEnd(14)} seq ${chosen.seq.avgMs}ms p95 ${chosen.seq.p95Ms}ms ${chosen.seq.rps} RPS | con ${chosen.con.avgMs}ms p95 ${chosen.con.p95Ms}ms ${chosen.con.rps} RPS (median of ${rounds.length}, CoV ${covPct(rounds.map((x) => x.con.rps))}%)`,
      );
    }

    // ── PHASE 4 (opt-in): STEADY-STATE SOAK ──────────────────────────────
    // Write-neutral daily mix at 8 workers; a flat line means stable, any slope
    // is a real time-based leak (GC, pool, WAL). BENCH_SOAK_SECONDS=60 enables.
    if (SOAK_SECONDS > 0) {
      logger.info(`\n⏱️  [PHASE 4] Steady-state soak (${SOAK_SECONDS}s, write-neutral mix)...`);
      const t0 = Date.now();
      const stop = { flag: false };
      const counter = { n: 0 };
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (!stop.flag) {
            try {
              await mixedStable();
              counter.n++;
            } catch {}
          }
        }),
      );
      const buckets: string[] = [];
      let lastT = t0;
      let lastN = 0;
      while (Date.now() - t0 < SOAK_SECONDS * 1000) {
        await new Promise((r) => setTimeout(r, 5000));
        const now = Date.now();
        const n = counter.n;
        buckets.push(
          `${((now - t0) / 1000).toFixed(1)}s:${((n - lastN) / ((now - lastT) / 1000)).toFixed(0)}`,
        );
        lastT = now;
        lastN = n;
      }
      stop.flag = true;
      const totalSec = (Date.now() - t0) / 1000;
      const avgRps = counter.n / totalSec;
      logger.info(`  → soak: ${counter.n} reqs, avg ${avgRps.toFixed(1)} RPS`);
      logger.info(`  → buckets: ${buckets.join(" ")}`);
      exportMetric("competitive.soak.avg_rps", +avgRps.toFixed(1), "req/s");
    }

    // ── REPORTING & EXPORT ───────────────────────────────────────────────
    printTruthTable({
      title: `COMPETITIVE HARNESS REPLICA (${dbType.toUpperCase()} — ${createdIds.length} Docs, COLD vs WARM)`,
      subtitle: `Cold vs Warm Steady-State (${CONCURRENCY}c)`,
      results: [...coldResults, ...warmResults],
    });

    const summaryMetrics = workloads.map((w) => {
      const cold = coldResults.find((r) => r.shortLabel === `${w.shortLabel}.cold`);
      const warm = warmResults.find((r) => r.shortLabel === w.shortLabel);
      const coldRps = cold ? cold.rps.toFixed(0) : "N/A";
      const warmRps = warm ? warm.rps.toFixed(0) : "N/A";
      const delta =
        cold && warm && cold.rps > 0
          ? `+${(((warm.rps - cold.rps) / cold.rps) * 100).toFixed(0)}%`
          : "-";

      return {
        key: `${w.shortLabel} (Cold → Warm)`,
        val: `${coldRps} → ${warmRps} (${delta})`,
        unit: "RPS",
      };
    });

    printSummaryTable(summaryMetrics, "Competitive Cold vs Warm");

    const findByIdRes = warmResults.find((r) => r.shortLabel === "findById");
    const listPlainRes = warmResults.find((r) => r.shortLabel === "listPlain");
    const gqlRes = warmResults.find((r) => r.shortLabel === "graphql");
    const createRes = warmResults.find((r) => r.shortLabel === "create");
    const updateRes = warmResults.find((r) => r.shortLabel === "update");

    if (findByIdRes) exportMetric("competitive.find_by_id.rps", findByIdRes.rps, "req/s");
    if (listPlainRes) exportMetric("competitive.list_plain.rps", listPlainRes.rps, "req/s");
    if (gqlRes) exportMetric("competitive.graphql.rps", gqlRes.rps, "req/s");
    if (createRes) exportMetric("competitive.create.rps", createRes.rps, "req/s");
    if (updateRes) exportMetric("competitive.update.rps", updateRes.rps, "req/s");

    for (const r of coldResults) {
      if (!String(r.shortLabel).endsWith(".seq")) {
        exportMetric(`competitive.cold.${r.shortLabel.replace(".cold", "")}.rps`, r.rps, "req/s");
      }
    }

    // Scale Guard Validation
    if (process.env.BENCH_SCALE_GUARD === "1") {
      const randomRead = warmResults.find((r) => r.shortLabel === "findByIdRandom");
      const minRatio = Number(process.env.BENCH_SCALE_MIN_WRITE_READ_RATIO) || 0.4;

      if (randomRead && createRes && updateRes && randomRead.rps > 0) {
        const createRatio = createRes.rps / randomRead.rps;
        const updateRatio = updateRes.rps / randomRead.rps;
        if (createRatio < minRatio || updateRatio < minRatio) {
          throw new Error(
            `Scale-cliff regression: Write/Read ratio below ${minRatio} (create: ${createRatio.toFixed(2)}, update: ${updateRatio.toFixed(2)})`,
          );
        }
      }
    }
  } finally {
    if (stopServer) {
      await stopServer();
      stopServer = null;
    }
  }
}, 300_000);
