/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description Direct DB adapter performance audit (CRUD operations).
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runDatabaseBenchmark() {
  console.log("🚀 Starting Direct Database Adapter Performance Audit...\n");

  logger.level = "silent";

  const { getDb, getDbInitPromise } = await import("@src/databases/db");
  await getDbInitPromise();
  const adapter = getDb();
  if (!adapter) throw new Error("Adapter not initialized");

  const dbType = process.env.DB_TYPE || "mongodb";
  const collection = "bench_crud_test";
  const tenantId = "global";
  const stableId = "bench-entry-fixed";

  console.log(`📊 Benchmarking: ${dbType.toUpperCase()} (Tenant: ${tenantId})`);

  // Ensure connection is active
  const { loadPrivateConfig } = await import("@src/databases/db");
  const config = await loadPrivateConfig(false);
  if (config) {
    let connStr: string;
    if (config.DB_TYPE === "mongodb") {
      const host = process.env.DB_HOST || config.DB_HOST || "127.0.0.1";
      const port = process.env.DB_PORT || config.DB_PORT || "27017";
      const name = process.env.DB_NAME || config.DB_NAME || "SveltyCMS_test";
      connStr = `mongodb://${host}:${port}/${name}`;
    } else if (config.DB_TYPE === "sqlite") {
      connStr = config.DB_NAME || "./config/database/SveltyCMS_test.sqlite";
    } else {
      connStr = config as any as string;
    }
    await adapter.connect(connStr);
  }

  // Pre-create model for NoSQL
  try {
    if (adapter.collection?.createModel) {
      await adapter.collection.createModel({
        _id: collection as any,
        name: collection,
        fields: [],
      } as any);
    }
  } catch (_) {
    // already exists
  }

  // 1. INSERT
  console.log(`📥 Benchmarking ${dbType} INSERT...`);
  const insertResult = await runBenchmark({
    name: `${dbType}: CRUD - INSERT`,
    iterations: 1000,
    warmupIterations: 100,
    onIteration: async (i) => {
      await adapter.crud.insert(
        collection,
        {
          _id: `${stableId}-${i}` as any,
          title: "Bench Entry",
          tenantId: tenantId as any,
        } as any,
        { tenantId: tenantId as any },
      );
    },
    silent: true,
  });

  // 2. FIND ONE
  console.log(`🔍 Benchmarking ${dbType} FIND ONE...`);
  const findResult = await runBenchmark({
    name: `${dbType}: CRUD - FIND ONE`,
    iterations: 2000,
    warmupIterations: 200,
    onIteration: async () => {
      const res = await adapter.crud.findOne(
        collection,
        { _id: `${stableId}-50` as any },
        { tenantId: tenantId as any },
      );
      if (!res.success) throw new Error("Find failed");
    },
    silent: true,
  });

  // 3. UPDATE
  console.log(`✏️  Benchmarking ${dbType} UPDATE...`);
  const updateResult = await runBenchmark({
    name: `${dbType}: CRUD - UPDATE`,
    iterations: 1000,
    warmupIterations: 100,
    onIteration: async () => {
      await adapter.crud.update(collection, `${stableId}-50` as any, { title: "Updated" } as any, {
        tenantId: tenantId as any,
      });
    },
    silent: true,
  });

  // 4. DELETE (Clean up previous inserts)
  console.log(`🗑️  Benchmarking ${dbType} DELETE...`);
  const deleteResult = await runBenchmark({
    name: `${dbType}: CRUD - DELETE`,
    iterations: 1000,
    onIteration: async (i) => {
      await adapter.crud.delete(collection, `${stableId}-${i}` as any, {
        tenantId: tenantId as any,
      });
    },
    silent: true,
  });

  logger.level = "info";

  // Summary
  console.log("\n" + "=".repeat(85));
  console.log(`🏆 ${dbType.toUpperCase()} ADAPTER RAW PERFORMANCE MATRIX`);
  console.log("=".repeat(85));
  [insertResult, findResult, updateResult, deleteResult].forEach((r) => {
    console.log(
      `| ${r.name.padEnd(25)} | ${r.avgMs.toFixed(4).padEnd(12)} | ${r.p95Ms.toFixed(4).padEnd(12)} | ${Math.round(r.rps).toLocaleString().padEnd(12)} |`,
    );
  });
  console.log("=".repeat(85) + "\n");

  exportResult(insertResult);
  exportResult(findResult);
  exportResult(updateResult);
  exportResult(deleteResult);
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Database Adapter Performance Suite", async () => {
    await runDatabaseBenchmark();
  }, 600000);
}
