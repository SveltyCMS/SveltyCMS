/**
 * @file tests/benchmarks/relational-performance.test.ts
 * @description
 * High-fidelity performance audit for complex GraphQL relations.
 * Bypasses network overhead using the Serverless Dispatcher.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult, checkBenchmarkEnv, mockDispatch } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

async function runWithMemoryTracking(name: string, fn: () => Promise<any>) {
  const memBefore = process.memoryUsage();
  const result = await fn();
  const memAfter = process.memoryUsage();

  const rssDelta = (memAfter.rss - memBefore.rss) / 1024 / 1024;
  const heapDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

  console.log(
    `   📊 ${name} memory delta → RSS: ${rssDelta.toFixed(2)} MB | Heap: ${heapDelta.toFixed(2)} MB`,
  );

  return { result, rssDelta, heapDelta };
}

export async function runRelationalBenchmark() {
  checkBenchmarkEnv();
  console.log("🚀 Starting High-Fidelity Relational GraphQL Performance Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  const ITERATIONS = 600;
  const WARMUP = Math.floor(ITERATIONS * 0.15);
  const RUNS = 3;

  const queries = [
    {
      name: "GraphQL Introspection",
      query: "{ __schema { queryType { fields { name } } } }",
      iterations: 50,
      warmup: 5,
    },
    {
      name: "Deep Relational Query",
      query: `
        query GetRelationalData {
          Authors_00000000(limit: 5) {
            _id
            name
            Posts(limit: 8) {
              _id
              title
              status
            }
          }
        }
      `,
      iterations: ITERATIONS,
      warmup: WARMUP,
    },
  ];

  const results: any[] = [];

  for (const q of queries) {
    console.log(`\n📌 Benchmarking: ${q.name}`);

    const res = await runWithMemoryTracking(q.name, () =>
      runBenchmark({
        name: q.name,
        iterations: q.iterations,
        warmupIterations: q.warmup,
        concurrency: 1,
        runs: RUNS,
        trimOutliers: "iqr",
        onIteration: async () => {
          const res = await mockDispatch({
            path: "/graphql",
            method: "POST",
            body: { query: q.query },
          });

          if (res.status !== 200) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              `GraphQL Query failed: ${res.status} - ${JSON.stringify(body).slice(0, 100)}`,
            );
          }
          await res.text();
        },
        silent: true,
      }),
    );

    results.push({ ...res.result, rssDelta: res.rssDelta });
  }

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(130));
  console.log("   📊 SVELTYCMS RELATIONAL GRAPHQL PERFORMANCE AUDIT");
  console.log("   High-Fidelity • Complex Joins • Serverless Dispatcher • 95% Confidence");
  console.log("=".repeat(130));

  console.log(
    `| ${"Operation".padEnd(38)} | ${"Avg Latency".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(38 + 22 + 14 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const rssDeltaStr =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";
    console.log(
      `| ${r.name.padEnd(38)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${rssDeltaStr.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(130));

  results.forEach((r) => exportResult(r));
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Relational Performance Suite (High-Fidelity)", async () => {
    await runRelationalBenchmark();
  }, 600000);
}
