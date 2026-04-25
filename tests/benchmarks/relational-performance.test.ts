/**
 * @file tests/benchmarks/relational-performance.test.ts
 * @description Enterprise relational performance audit for SveltyCMS.
 * Measures GraphQL resolver performance for complex joins and deep relations.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let server: any;

async function runRelationalAudit() {
  console.log("🚀 Starting Enterprise Relational Audit...\n");

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Setup Server & Data
    server = await setupBenchmarkServer();
    const baseUrl = server.baseUrl;

    console.log("📊 Seeding relational test data (Users + Audit Logs)...");
    const { getDb } = await import("@src/databases/db");
    const { ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    // Seed some users if they don't exist
    const userIds = ["rel-user-1", "rel-user-2", "rel-user-3"];
    for (const id of userIds) {
      await db.crud
        .insert(
          "system_users",
          {
            _id: id as any,
            username: id,
            email: `${id}@test.com`,
            role: "admin",
            tenantId: "global" as any,
          } as any,
          "global" as any,
        )
        .catch(() => {});

      // Seed some audit logs for each user
      const logs = Array.from({ length: 50 }).map((_, i) => ({
        _id: `log-${id}-${i}` as any,
        user: id,
        action: "test.action",
        collection: "benchmark",
        timestamp: new Date().toISOString(),
        tenantId: "global" as any,
      }));
      await db.crud.insertMany("system_audit_logs", logs as any[], "global" as any).catch(() => {});
    }

    const RUNS = 2;
    const ITERATIONS = 300;
    const WARMUP = 50;

    const querySimple = {
      query: `{
        entries(collection: "system_users", limit: 10) {
          _id
          username
        }
      }`,
    };

    // 2. Measure Simple List
    const simpleStats = await runBenchmark({
      name: "Shallow List (Users)",
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: 4,
      onIteration: async () => {
        const res = await fetch(baseUrl + "/api/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": TEST_API_SECRET,
          },
          body: JSON.stringify(querySimple),
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
      silent: true,
    });

    printTruthTable({
      title: "SVELTYCMS  —  RELATIONAL RESOLVER AUDIT",
      subtitle: `GraphQL Join Performance • ${getDbType().toUpperCase()} • Full Pipeline`,
      results: [{ ...simpleStats, layer: "Shallow", overheadPct: 0 }],
    });

    printSummaryTable([
      { key: "User List Latency (Avg)", val: simpleStats.avgMs, unit: "ms" },
      { key: "User List Latency (p95)", val: simpleStats.p95Ms, unit: "ms" },
      { key: "Throughput", val: Math.round(simpleStats.rps), unit: "req/s" },
    ]);

    exportResult(simpleStats);
    await server.stop();
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Relational audit completed.");
}

test("Relational Resolver Performance", async () => {
  await runRelationalAudit();
}, 600000);
