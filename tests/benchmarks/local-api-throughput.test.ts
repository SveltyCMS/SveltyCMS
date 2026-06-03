/**
 * @file tests/benchmarks/local-api-throughput.test.ts
 * @description Local SDK Comprehensive Throughput
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
  const dbType = getDbType();
  const T = "global";

  // ═══════════════════════════════════════════════
  // PHASE 1: WRITE THROUGHPUT
  // ═══════════════════════════════════════════════
  console.log("   ═══ PHASE 1: WRITES ═══");
  await db.collection
    .createModel({
      _id: "BenchmarkStable",
      name: "BenchmarkStable",
      fields: [
        { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
      ],
    })
    .catch(() => {});

  for (let i = 0; i < WRITE_DOCS; i += 50) {
    const docs = [];
    for (let j = i; j < Math.min(i + 50, WRITE_DOCS); j++)
      docs.push({
        _id: `local-tp-${j}`,
        title: `W${j}`,
        count: 0,
        tenantId: T,
      });
    await db.crud.insertMany("BenchmarkStable", docs, { tenantId: T });
  }

  const totalWrites = WRITE_DOCS * WRITES_PER_DOC;
  const w0 = performance.now();
  const writeTasks: Promise<any>[] = [];
  for (let d = 0; d < WRITE_DOCS; d++)
    for (let w = 0; w < WRITES_PER_DOC; w++)
      writeTasks.push(
        db.crud.atomicIncrement(
          "BenchmarkStable",
          `local-tp-${d}`,
          "count",
          1,
          { tenantId: T },
        ),
      );
  const writeResults = await Promise.all(writeTasks);
  const writeMs = performance.now() - w0;
  const writeOk = writeResults.filter((r: any) => r?.success).length;
  const writeRPS = (totalWrites / writeMs) * 1000;
  console.log(
    `   Writes: ${writeOk}/${totalWrites} OK, ${writeRPS.toFixed(0)} RPS, ${writeMs.toFixed(0)}ms`,
  );

  // ═══════════════════════════════════════════════
  // PHASE 2: READ THROUGHPUT
  // ═══════════════════════════════════════════════
  console.log("   ═══ PHASE 2: READS ═══");
  const readCols: string[] = [];
  for (let c = 0; c < READ_COLLECTIONS; c++) {
    const name = `bench_read_${c}`;
    readCols.push(name);
    await db.collection
      .createModel({ _id: name, name, fields: [] })
      .catch(() => {});
    const docs = Array.from({ length: DOCS_PER_COLLECTION }, (_, i) => ({
      _id: `rd-${c}-${i}`,
      title: `R${c}-${i}`,
      tenantId: T,
    }));
    await db.crud.insertMany(name, docs, { tenantId: T });
  }

  const totalReads = READ_COLLECTIONS * DOCS_PER_COLLECTION;
  const r0 = performance.now();
  const readTasks: Promise<any>[] = [];
  for (let c = 0; c < READ_COLLECTIONS; c++)
    for (let i = 0; i < DOCS_PER_COLLECTION; i++)
      readTasks.push(
        db.crud.findOne(readCols[c], { _id: `rd-${c}-${i}` } as any, {
          tenantId: T,
        }),
      );
  const readResults = await Promise.all(readTasks);
  const readMs = performance.now() - r0;
  const readOk = readResults.filter((r: any) => r?.success && r?.data).length;
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

  if (writeOk !== totalWrites)
    throw new Error(`Lost ${totalWrites - writeOk} writes`);
}

test("Local SDK Benchmark", async () => {
  try {
    await run();
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 600000);
