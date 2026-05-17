/**
 * @file scripts/benchmark-persistence.ts
 * @description
 * High-performance persistence contract benchmark (Pillar 3 Focus) for SveltyCMS.
 * Measures core read/write cycles (100 reads -> 5 modifications -> 5 writes) and logs telemetry to CSV.
 *
 * Responsibilities include:
 * - Establishing a sterile in-memory SQLite database.
 * - Provisioning dynamic benchmark tables.
 * - Executing read/write load profiles under strict millisecond timing.
 * - Telemetry exporting to persistent CSV ledgers.
 */

import { SQLiteAdapter } from "../src/databases/sqlite/sqlite-adapter";
import { generateUUID } from "../src/utils/native-utils";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

async function runPersistenceBenchmark() {
  console.log("\n========================================================");
  console.log("⚡ SVELTYCMS — PERSISTENCE CONTRACT BENCHMARK (PILLAR 3)");
  console.log("========================================================\n");

  // 1. Initialize sterile in-memory SQLite database connection
  console.log("🔌 Initializing sterile in-memory database adapter...");
  const adapter = new SQLiteAdapter();
  const connResult = await adapter.connect(":memory:");
  if (!connResult.success) {
    console.error("❌ Database connection failed:", connResult.message);
    process.exit(1);
  }
  console.log("✅ In-memory database connection established.");

  // 2. Provision the dynamic benchmark table structure
  console.log("🔨 Provisioning dynamic benchmark tables...");
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS "collection_benchmark" (
      "_id" TEXT PRIMARY KEY,
      "tenantId" TEXT,
      "data" TEXT NOT NULL DEFAULT '{}',
      "status" TEXT NOT NULL DEFAULT 'draft',
      "isDeleted" INTEGER NOT NULL DEFAULT 0,
      "createdAt" INTEGER NOT NULL,
      "updatedAt" INTEGER NOT NULL
    );
  `;
  try {
    await adapter.raw.execute(createTableSql);
    console.log("✅ Dynamic table 'collection_benchmark' provisioned.");
  } catch (err: any) {
    console.error("❌ Schema provisioning failed:", err.message);
    await adapter.disconnect();
    process.exit(1);
  }

  // 3. Seed 100 dynamic records
  console.log("🌱 Seeding database with 100 baseline records...");
  const seedData = Array.from({ length: 100 }, (_, i) => ({
    _id: generateUUID(),
    title: `Benchmark Document ${i + 1}`,
    index: i,
    payload: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    isActive: i % 2 === 0,
  }));

  const seedStart = performance.now();
  const seedResult = (await adapter.crud.insertMany(
    "collection_benchmark",
    seedData as any,
  )) as any;
  const seedDuration = performance.now() - seedStart;

  if (!seedResult.success) {
    console.error("❌ Seeding failed:", seedResult.message);
    await adapter.disconnect();
    process.exit(1);
  }
  console.log(`✅ Seeded 100 records successfully in ${seedDuration.toFixed(2)}ms.`);

  // 4. Execute Core Read/Write Cycle (SLA Audit)
  console.log("\n🔥 Starting Core Read/Write Persistence Cycle...");
  const cycleStart = performance.now();

  // A. READ Phase: Read 100 records
  const readStart = performance.now();
  const findResult = (await adapter.crud.findMany("collection_benchmark", {})) as any;
  const readDuration = performance.now() - readStart;

  if (!findResult.success || !findResult.data) {
    console.error("❌ Read phase failed:", findResult.message);
    await adapter.disconnect();
    process.exit(1);
  }
  const records = findResult.data;

  // B. MODIFY Phase: Select and modify 5 records
  const modifyStart = performance.now();
  const targetIndices = [10, 25, 50, 75, 90];
  const updatesToApply = targetIndices.map((idx) => {
    const record = records[idx];
    return {
      _id: record._id,
      title: `${record.title} (Updated via Benchmark)`,
      payload: "Updated payload containing modified benchmark values.",
      index: record.index,
      isActive: !record.isActive,
    };
  });
  const modifyDuration = performance.now() - modifyStart;

  // C. WRITE Phase: Commit the 5 modifications back to SQLite
  const writeStart = performance.now();
  for (const update of updatesToApply) {
    const updateResult = (await adapter.crud.update(
      "collection_benchmark",
      update._id,
      update as any,
    )) as any;
    if (!updateResult.success) {
      console.error(`❌ Write phase failed for record ${update._id}:`, updateResult.message);
      await adapter.disconnect();
      process.exit(1);
    }
  }
  const writeDuration = performance.now() - writeStart;

  const totalCycleDuration = performance.now() - cycleStart;

  // 5. Audit SLA Threshold (< 10ms)
  const isSlaPassed = totalCycleDuration < 10.0;
  const slaStatus = isSlaPassed ? "🟢 SLA PASSED" : "🔴 SLA VIOLATION";

  // 6. Log Results to persistent CSV ledger
  const csvDir = join(process.cwd(), "artifacts");
  if (!existsSync(csvDir)) {
    mkdirSync(csvDir, { recursive: true });
  }
  const csvPath = join(csvDir, "persistence_benchmarks.csv");
  const hasHeader = existsSync(csvPath);

  if (!hasHeader) {
    const headers =
      "Timestamp,DBType,TotalRecords,CycleDurationMs,ReadDurationMs,ModifyDurationMs,WriteDurationMs,SLAPassed\n";
    appendFileSync(csvPath, headers);
  }

  const row = `${new Date().toISOString()},sqlite,100,${totalCycleDuration.toFixed(4)},${readDuration.toFixed(4)},${modifyDuration.toFixed(4)},${writeDuration.toFixed(4)},${isSlaPassed}\n`;
  appendFileSync(csvPath, row);

  // 7. Print Premium ASCII Telemetry Dashboard
  console.log("\n========================================================");
  console.log("📊 PERSISTENCE CYCLE TELEMETRY DASHBOARD");
  console.log("========================================================");
  console.log(` Database Adapter     │ SQLite (sterile in-memory)`);
  console.log(` Total Records        │ 100 documents`);
  console.log(` SLA Status           │ ${slaStatus}`);
  console.log("--------------------------------------------------------");
  console.log(` 📂 100 Reads Phase   │ ${readDuration.toFixed(4)} ms`);
  console.log(` ✏️  5 Modify Phase    │ ${modifyDuration.toFixed(4)} ms`);
  console.log(` 💾 5 Writes Phase    │ ${writeDuration.toFixed(4)} ms`);
  console.log("--------------------------------------------------------");
  console.log(` ⏱️  TOTAL CYCLE TIME  │ ${totalCycleDuration.toFixed(4)} ms`);
  console.log("========================================================\n");

  console.log(`📈 CSV entry appended to: ${csvPath}\n`);

  await adapter.disconnect();
}

runPersistenceBenchmark().catch((err) => {
  console.error("❌ Fatal benchmark failure:", err);
  process.exit(1);
});
