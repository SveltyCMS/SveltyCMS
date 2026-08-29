/**
 * @file tests/benchmarks/local-api-throughput.test.ts
 * @description Local SDK Comprehensive Throughput (Optimized)
 * @summary Measures direct adapter write throughput, read throughput, and percentile latencies with zero HTTP overhead.
 */

import {
  test,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  exportResult,
  exportMetric,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const WRITE_DOCS = 100;
const WRITES_PER_DOC = 10;
const READ_COLLECTIONS = 10;
const DOCS_PER_COLLECTION = 100;

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

function calculatePercentiles(latencies: Float64Array) {
  latencies.sort();
  const len = latencies.length;
  const avg = latencies.reduce((a, b) => a + b, 0) / len;
  const p50 = latencies[Math.floor(len * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(len * 0.95)] ?? 0;
  const p99 = latencies[Math.floor(len * 0.99)] ?? 0;
  return { avg, p50, p95, p99 };
}

async function run() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Local Adapter Throughput Audit (${dbType})...\n`);

  const server = await setupBenchmarkServer();
  stopServer = server.stop;

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb() as any;
  const isSqlite = dbType.includes("SQLITE");
  const isMongo = dbType.includes("MONGO");
  const T = "global";

  const GLOBAL_TENANT_OPTS = Object.freeze({
    tenantId: T,
    bypassCache: true,
  });

  const BATCH = isSqlite ? 50 : isMongo ? 50 : 15;
  const readCols: string[] = Array.from({ length: READ_COLLECTIONS }, (_, c) => `bench_read_${c}`);

  try {
    // ════════════════════════════════════════════════════════════════════════
    // PHASE 1: DIRECT ATOMIC WRITE THROUGHPUT
    // ════════════════════════════════════════════════════════════════════════
    console.log("   ═══ PHASE 1: ATOMIC WRITES ═══");
    await db.collection
      .createModel({
        _id: "BenchmarkStable",
        name: "BenchmarkStable",
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
          { db_fieldName: "count", widget: { Name: "Input" }, type: "number" },
        ],
      })
      .catch(() => {});

    // Seed baseline docs in chunked batches
    const writeDocIds: string[] = [];
    for (let i = 0; i < WRITE_DOCS; i += 50) {
      const limit = Math.min(i + 50, WRITE_DOCS);
      const docs = [];
      for (let j = i; j < limit; j++) {
        const _id = crypto.randomUUID();
        writeDocIds.push(_id);
        docs.push({
          _id,
          title: `W${j}`,
          count: 0,
          tenantId: T,
        });
      }
      await db.crud.insertMany("BenchmarkStable", docs, GLOBAL_TENANT_OPTS);
    }

    const totalWrites = WRITE_DOCS * WRITES_PER_DOC;
    const writeLatencies = new Float64Array(totalWrites);
    let writeOk = 0;
    let writeIdx = 0;

    forceGarbageCollection();
    await stabilize(100);

    const w0 = performance.now();

    // Direct wave loop without intermediate thunk allocations
    for (let d = 0; d < WRITE_DOCS; d++) {
      const docId = writeDocIds[d]!;
      for (let w = 0; w < WRITES_PER_DOC; w += BATCH) {
        const batchLimit = Math.min(w + BATCH, WRITES_PER_DOC);
        const wavePromises = [];

        for (let step = w; step < batchLimit; step++) {
          const currentWriteSlot = writeIdx++;
          wavePromises.push(
            (async () => {
              const tStart = performance.now();
              const res = await db.crud.atomicIncrement(
                "BenchmarkStable",
                docId,
                "count",
                1,
                GLOBAL_TENANT_OPTS,
              );
              writeLatencies[currentWriteSlot] = performance.now() - tStart;
              if (res?.success) writeOk++;
            })(),
          );
        }
        await Promise.all(wavePromises);
      }
    }

    const writeMs = performance.now() - w0;
    const writeRPS = totalWrites / (writeMs / 1000);
    const writeStats = calculatePercentiles(writeLatencies);

    console.log(
      `   Writes: ${writeOk}/${totalWrites} OK, ${Math.round(writeRPS)} RPS, Avg: ${writeStats.avg.toFixed(3)}ms (P95: ${writeStats.p95.toFixed(3)}ms)`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: DIRECT FIND-ONE READ THROUGHPUT
    // ════════════════════════════════════════════════════════════════════════
    console.log("\n   ═══ PHASE 2: PARALLEL READS ═══");

    // Provision multi-collection read tree
    await Promise.all(
      readCols.map(async (name, c) => {
        await db.collection.createModel({ _id: name, name, fields: [] }).catch(() => {});
        const docs = Array.from({ length: DOCS_PER_COLLECTION }, (_, i) => ({
          _id: `rd-${c}-${i}`,
          title: `R${c}-${i}`,
          tenantId: T,
        }));
        return db.crud.insertMany(name, docs, GLOBAL_TENANT_OPTS);
      }),
    );

    forceGarbageCollection();
    await stabilize(100);

    const totalReads = READ_COLLECTIONS * DOCS_PER_COLLECTION;
    const readLatencies = new Float64Array(totalReads);
    let readOk = 0;
    let readIdx = 0;

    const r0 = performance.now();

    for (let c = 0; c < READ_COLLECTIONS; c++) {
      const colName = readCols[c]!;
      for (let i = 0; i < DOCS_PER_COLLECTION; i += BATCH) {
        const batchLimit = Math.min(i + BATCH, DOCS_PER_COLLECTION);
        const wavePromises = [];

        for (let k = i; k < batchLimit; k++) {
          const currentReadSlot = readIdx++;
          const filter = { _id: `rd-${c}-${k}` };

          wavePromises.push(
            (async () => {
              const tStart = performance.now();
              const res = await db.crud.findOne(colName, filter, GLOBAL_TENANT_OPTS);
              readLatencies[currentReadSlot] = performance.now() - tStart;
              if (res?.success && res?.data) readOk++;
            })(),
          );
        }
        await Promise.all(wavePromises);
      }
    }

    const readMs = performance.now() - r0;
    const readRPS = totalReads / (readMs / 1000);
    const readStats = calculatePercentiles(readLatencies);

    console.log(
      `   Reads:  ${readOk}/${totalReads} found, ${Math.round(readRPS)} RPS, Avg: ${readStats.avg.toFixed(3)}ms (P95: ${readStats.p95.toFixed(3)}ms)\n`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // REPORTING & TELEMETRY
    // ════════════════════════════════════════════════════════════════════════
    const results = [
      {
        name: `Writes (${totalWrites} atomic increments)`,
        shortLabel: "Writes",
        avgMs: writeStats.avg,
        p95Ms: writeStats.p95,
        rps: writeRPS,
        layer: writeOk === totalWrites ? "Adapter" : "⚠️ Degraded",
      },
      {
        name: `Reads (${totalReads} point lookups)`,
        shortLabel: "Reads",
        avgMs: readStats.avg,
        p95Ms: readStats.p95,
        rps: readRPS,
        layer: readOk >= totalReads * 0.99 ? "Adapter" : "⚠️ Degraded",
      },
    ];

    printTruthTable({
      title: `SVELTYCMS — DIRECT ADAPTER THROUGHPUT (${dbType})`,
      shortLabel: "Adapter",
      subtitle: `${totalWrites} Writes • ${totalReads} Reads • Zero HTTP`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Write Throughput", val: Math.round(writeRPS), unit: "ops/s" },
        { key: "Write Latency (Avg)", val: writeStats.avg.toFixed(3), unit: "ms" },
        { key: "Write Latency (P95)", val: writeStats.p95.toFixed(3), unit: "ms" },
        { key: "Writes Integrity", val: `${writeOk}/${totalWrites}`, unit: "" },
        { key: "Read Throughput", val: Math.round(readRPS), unit: "ops/s" },
        { key: "Read Latency (Avg)", val: readStats.avg.toFixed(3), unit: "ms" },
        { key: "Read Latency (P95)", val: readStats.p95.toFixed(3), unit: "ms" },
        { key: "Reads Integrity", val: `${readOk}/${totalReads}`, unit: "" },
      ],
      "Adapter Throughput Summary",
    );

    exportMetric("adapter.throughput.write_rps", Math.round(writeRPS), "ops/s");
    exportMetric("adapter.throughput.write_p95_ms", writeStats.p95, "ms");
    exportMetric("adapter.throughput.read_rps", Math.round(readRPS), "ops/s");
    exportMetric("adapter.throughput.read_p95_ms", readStats.p95, "ms");

    for (const r of results) exportResult(r);

    if (writeOk !== totalWrites) {
      throw new Error(`Integrity Failure: Lost ${totalWrites - writeOk} writes`);
    }
  } finally {
    // Clean up provisioned temporary read collections
    for (const col of readCols) {
      await db.crud
        .deleteMany(col, {}, { bypassTenantCheck: true, permanent: true })
        .catch(() => {});
    }
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Local SDK Benchmark", async () => {
  await run();
}, 600_000);
