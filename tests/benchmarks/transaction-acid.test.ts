/**
 * @file tests/benchmarks/transaction-acid.test.ts
 * @description Enterprise ACID transaction benchmark for SveltyCMS.
 * Measures atomicity, commit/rollback latency, and multi-step transaction scaling.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult, exportMetric, stabilize } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const COLLECTION_ID = "bench_acid_test";
const TEST_TENANT = "global";

export async function runAcidBenchmark() {
  console.log("💎 Starting Enterprise ACID Benchmark...\n");

  logger.level = "silent";

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  const adapter = getDb();
  if (!adapter) throw new Error("DB adapter missing");

  if (!(adapter as any).transaction) {
    console.log("⏭️ Adapter does not support transactions. Skipping.");
    return;
  }

  // === Preparation: Clean Slate ===
  if (typeof (adapter as any).clearDatabase === "function") {
    await (adapter as any).clearDatabase().catch(() => {});
  }

  await adapter.collection
    ?.createModel?.({
      _id: COLLECTION_ID,
      name: COLLECTION_ID,
      fields: [{ name: "title", type: "text" }],
    } as any)
    .catch(() => {});

  await stabilize();

  const RUNS = 3;
  const ITERATIONS = 1200;
  const WARMUP = 120;
  const results: any[] = [];
  const concurrencyLevels = [1, 8, 32];

  async function bench(name: string, concurrency: number, fn: (i: number) => Promise<void>) {
    const r = await runBenchmark({
      name,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onSetup: stabilize,
      onIteration: async (i) => {
        // 🚀 NEW: Iteration-level hygiene to prevent UNIQUE constraint failures
        // Only needed for high-concurrency loops that reuse deterministic IDs
        const id = name.includes("Commit")
          ? `c-${concurrency}-${i}`
          : name.includes("Rollback")
            ? `r-${concurrency}-${i}`
            : `m-${concurrency}-${i}`;

        await adapter!.crud
          .delete(COLLECTION_ID, id as any, { tenantId: TEST_TENANT as any })
          .catch(() => {});

        return fn(i);
      },
    });
    results.push(r);
    return r;
  }

  // 1. Commit
  for (const c of concurrencyLevels) {
    await bench(`Commit @ ${c}c`, c, async (i) => {
      await (adapter as any).transaction(async (tx: any) => {
        await tx.insert(
          COLLECTION_ID,
          { _id: `c-${c}-${i}`, title: "commit" },
          { tenantId: TEST_TENANT as any },
        );
      });
    });
  }

  // 2. Rollback
  for (const c of [1, 8]) {
    await bench(`Rollback @ ${c}c`, c, async (i) => {
      try {
        await (adapter as any).transaction(async (tx: any) => {
          await tx.insert(
            COLLECTION_ID,
            { _id: `r-${c}-${i}`, title: "rollback" },
            { tenantId: TEST_TENANT as any },
          );
          throw new Error("ROLLBACK_TRANSACTION");
        });
      } catch {}
    });
  }

  // 3. Multi Statement
  for (const c of [1, 8]) {
    await bench(`Multi TX @ ${c}c`, c, async (i) => {
      await (adapter as any).transaction(async (tx: any) => {
        const id = `m-${c}-${i}`;
        await tx.insert(COLLECTION_ID, { _id: id, title: "one" }, { tenantId: TEST_TENANT as any });
        await tx.update(COLLECTION_ID, id, { title: "two" }, { tenantId: TEST_TENANT as any });
        await tx.findById?.(COLLECTION_ID, id, { tenantId: TEST_TENANT as any });
      });
    });
  }

  logger.level = "info";

  console.log("\n" + "=".repeat(150));
  console.log("💎 SVELTYCMS ACID ENTERPRISE REPORT");
  console.log("Commit • Rollback • Multi-Step • Concurrency");
  console.log("=".repeat(150));

  console.log(
    `| ${"Scenario".padEnd(28)} | ${"Avg".padEnd(12)} | ${"p95".padEnd(12)} | ${"TPS".padEnd(12)} | ${"RSS Δ".padEnd(10)} |`,
  );
  console.log("|" + "-".repeat(145) + "|");

  for (const r of results) {
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)}MB` : "—";
    console.log(
      `| ${r.name.padEnd(28)} | ` +
        `${r.avgMs.toFixed(3)} ms`.padEnd(12) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(10)} |`,
    );
  }
  console.log("=".repeat(150));

  // Insights
  const commit1 = results.find((r) => r.name === "Commit @ 1c");
  const commit32 = results.find((r) => r.name === "Commit @ 32c");
  const rollback1 = results.find((r) => r.name === "Rollback @ 1c");
  const multi1 = results.find((r) => r.name === "Multi TX @ 1c");

  console.log("\n✨ Insights:");
  if (commit1) console.log(`• Base commit cost: ${commit1.avgMs.toFixed(3)} ms`);
  if (rollback1) console.log(`• Rollback cost: ${rollback1.avgMs.toFixed(3)} ms`);
  if (multi1) console.log(`• Multi-step TX: ${multi1.avgMs.toFixed(3)} ms`);
  if (commit1 && commit32) {
    const loss = ((commit1.rps - commit32.rps / 32) / commit1.rps) * 100;
    console.log(`• Scaling loss: ${loss.toFixed(1)}%`);
  }

  const maxTps = Math.max(...results.map((r) => r.rps));
  exportMetric("adapter.transaction.commit.avg", commit1?.avgMs || 0, "ms");
  exportMetric("adapter.transaction.rollback.avg", rollback1?.avgMs || 0, "ms");
  exportMetric("adapter.transaction.multi.avg", multi1?.avgMs || 0, "ms");
  exportMetric("adapter.transaction.max_tps", maxTps, "tx/s");
  if (commit1 && commit32) {
    exportMetric(
      "adapter.transaction.scaling_loss",
      ((commit1.rps - commit32.rps / 32) / commit1.rps) * 100,
      "%",
    );
  }

  exportResult({
    name: "ACID Aggregate",
    avgMs: commit1?.avgMs || 0,
    p95Ms: commit1?.p95Ms || 0,
    rps: maxTps,
  });

  for (const r of results) exportResult(r);
  console.log("\n✅ ACID benchmark completed.");
}

test("ACID Enterprise Suite", async () => {
  await runAcidBenchmark();
}, 450000);
