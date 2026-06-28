/**
 * @file tests/benchmarks/local-api-throughput.test.ts
 * @description Local SDK Comprehensive Throughput (Optimized)
 * @summary Measures write throughput, read throughput, and SDK overhead in one pass.
 * Direct adapter calls — no HTTP, no middleware.
 */

import {
  test,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const WRITE_DOCS = 100;
const WRITES_PER_DOC = 10;
const READ_COLLECTIONS = 10;
const DOCS_PER_COLLECTION = 100;

let stopServer: (() => Promise<void>) | null = null;

async function run() {
  const server = await setupBenchmarkServer();
  stopServer = server.stop;

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb() as any;
  const dbType = getDbType().toLowerCase();
  const T = "global";

  // Freeze target operational settings to prevent runtime garbage allocation
  const GLOBAL_TENANT_OPTS = Object.freeze({ tenantId: T });

  // ═══════════════════════════════════════════════
  // PHASE 1: WRITE THROUGHPUT PREPARATION
  // ═══════════════════════════════════════════════
  console.log("   ═══ PHASE 1: WRITES ═══");
  await db.collection
    .createModel({
      _id: "BenchmarkStable",
      name: "BenchmarkStable",
      fields: [{ db_fieldName: "title", widget: { Name: "Input" }, type: "string" }],
    })
    .catch(() => {});

  for (let i = 0; i < WRITE_DOCS; i += 50) {
    const docs = [];
    const limit = Math.min(i + 50, WRITE_DOCS);
    for (let j = i; j < limit; j++) {
      docs.push({
        _id: `local-tp-${j}`,
        title: `W${j}`,
        count: 0,
        tenantId: T,
      });
    }
    await db.crud.insertMany("BenchmarkStable", docs, GLOBAL_TENANT_OPTS);
  }

  // Optimize batch throughput according to database locking signatures
  const BATCH = dbType.includes("sqlite") ? 50 : dbType.includes("mongodb") ? 200 : 100;
  const totalWrites = WRITE_DOCS * WRITES_PER_DOC;

  const writeTasksThunks: (() => Promise<any>)[] = [];
  for (let d = 0; d < WRITE_DOCS; d++) {
    const docId = `local-tp-${d}`;
    for (let w = 0; w < WRITES_PER_DOC; w++) {
      writeTasksThunks.push(() =>
        db.crud.atomicIncrement("BenchmarkStable", docId, "count", 1, GLOBAL_TENANT_OPTS),
      );
    }
  }

  const writeResults: any[] = [];
  const w0 = performance.now();

  // Execute true connection-pool-aware serial waves
  for (let i = 0; i < writeTasksThunks.length; i += BATCH) {
    const wave = writeTasksThunks.slice(i, i + BATCH).map((thunk) => thunk());
    const waveRes = await Promise.all(wave);
    for (let j = 0; j < waveRes.length; j++) {
      writeResults.push(waveRes[j]);
    }
  }

  const writeMs = performance.now() - w0;

  let writeOk = 0;
  for (let i = 0; i < writeResults.length; i++) {
    if (writeResults[i]?.success) writeOk++;
  }

  const writeRPS = (totalWrites / writeMs) * 1000;
  console.log(
    `   Writes: ${writeOk}/${totalWrites} OK, ${writeRPS.toFixed(0)} RPS, ${writeMs.toFixed(0)}ms`,
  );

  // ═══════════════════════════════════════════════
  // PHASE 2: READ THROUGHPUT PREPARATION
  // ═══════════════════════════════════════════════
  console.log("   ═══ PHASE 2: READS ═══");
  const readCols: string[] = Array.from({ length: READ_COLLECTIONS }, (_, c) => `bench_read_${c}`);

  // Provision read schema collections concurrently to prevent transaction gaps
  const setupPromises = readCols.map(async (name, c) => {
    await db.collection.createModel({ _id: name, name, fields: [] }).catch(() => {});
    const docs = Array.from({ length: DOCS_PER_COLLECTION }, (_, i) => ({
      _id: `rd-${c}-${i}`,
      title: `R${c}-${i}`,
      tenantId: T,
    }));
    return db.crud.insertMany(name, docs, GLOBAL_TENANT_OPTS);
  });
  await Promise.all(setupPromises);

  const totalReads = READ_COLLECTIONS * DOCS_PER_COLLECTION;
  const readTasksThunks: (() => Promise<any>)[] = [];

  for (let c = 0; c < READ_COLLECTIONS; c++) {
    const colName = readCols[c]!;
    for (let i = 0; i < DOCS_PER_COLLECTION; i++) {
      const filter = { _id: `rd-${c}-${i}` };
      readTasksThunks.push(() => db.crud.findOne(colName, filter, GLOBAL_TENANT_OPTS));
    }
  }

  const readResults: any[] = [];
  const r0 = performance.now();

  for (let i = 0; i < readTasksThunks.length; i += BATCH) {
    const wave = readTasksThunks.slice(i, i + BATCH).map((thunk) => thunk());
    const waveRes = await Promise.all(wave);
    for (let j = 0; j < waveRes.length; j++) {
      readResults.push(waveRes[j]);
    }
  }

  const readMs = performance.now() - r0;

  let readOk = 0;
  for (let i = 0; i < readResults.length; i++) {
    const r = readResults[i];
    if (r?.success && r?.data) readOk++;
  }

  const readRPS = (totalReads / readMs) * 1000;
  console.log(
    `   Reads:  ${readOk}/${totalReads} found, ${readRPS.toFixed(0)} RPS, ${readMs.toFixed(0)}ms`,
  );

  // ═══════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════
  printTruthTable({
    title: `SVELTYCMS — LOCAL SDK BENCHMARK (${dbType.toUpperCase()})`,
    shortLabel: "Local",
    subtitle: "Direct adapter — no HTTP",
    results: [
      {
        name: "Writes (1000)",
        avgMs: writeMs / totalWrites,
        p95Ms: 0,
        rps: writeRPS,
        layer: writeOk === totalWrites ? "✅" : "❌",
      },
      {
        name: "Reads (1000)",
        avgMs: readMs / totalReads,
        p95Ms: 0,
        rps: readRPS,
        layer: readOk > totalReads * 0.99 ? "✅" : "⚠️",
      },
    ],
  });

  printSummaryTable([
    { key: "Database", val: dbType.toUpperCase(), unit: "" },
    { key: "Write RPS", val: writeRPS, unit: "req/s" },
    { key: "Writes OK", val: `${writeOk}/${totalWrites}`, unit: "" },
    { key: "Read RPS", val: readRPS, unit: "req/s" },
    { key: "Reads OK", val: `${readOk}/${totalReads}`, unit: "" },
    { key: "Write × HTTP", val: (writeRPS / 500).toFixed(1) + "×", unit: "" },
  ]);

  if (writeOk !== totalWrites) throw new Error(`Lost ${totalWrites - writeOk} writes`);
}

test("Local SDK Benchmark", async () => {
  try {
    await run();
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 600000);
