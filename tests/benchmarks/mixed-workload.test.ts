/**
 * @file tests/benchmarks/mixed-workload.test.ts
 * @description Enterprise mixed workload benchmark for SveltyCMS.
 * Simulates realistic production traffic with weighted operations and multi-concurrency scaling.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  checkBenchmarkEnv,
  mockDispatch,
  stabilize,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

type Operation = {
  type: "read" | "graphql" | "write";
  name: string;
  path: string;
  method: string;
  body?: any;
  bodyFn?: () => any;
  weight: number;
};

const OPERATIONS: Operation[] = [
  {
    type: "read",
    name: "GET Health",
    path: "/system/health",
    method: "GET",
    weight: 25,
  },
  {
    type: "read",
    name: "GET Collections",
    path: "/collections",
    method: "GET",
    weight: 20,
  },
  {
    type: "read",
    name: "GET User",
    path: "/user/me",
    method: "GET",
    weight: 10,
  },
  {
    type: "read",
    name: "GET posts List",
    path: "/collections/posts?limit=20",
    method: "GET",
    weight: 10,
  },
  {
    type: "graphql",
    name: "GraphQL Me",
    path: "/graphql",
    method: "POST",
    body: {
      query: `query { me { _id username role } }`,
    },
    weight: 15,
  },
  {
    type: "graphql",
    name: "GraphQL Nested",
    path: "/graphql",
    method: "POST",
    body: {
      query: `
        query {
          posts(limit:10){
            _id
            title
            author { name }
          }
        }
      `,
    },
    weight: 10,
  },
  {
    type: "write",
    name: "POST Create Entry",
    path: "/collections/posts",
    method: "POST",
    bodyFn: () => ({
      title: "Mixed Entry " + Date.now() + "-" + Math.random().toString(36).slice(2),
      content: "Enterprise mixed workload test",
    }),
    weight: 10,
  },
];

function pickWeighted(): Operation {
  const total = OPERATIONS.reduce((sum, op) => sum + op.weight, 0);
  let r = Math.random() * total;

  for (const op of OPERATIONS) {
    r -= op.weight;
    if (r <= 0) return op;
  }
  return OPERATIONS[0];
}

export async function runMixedWorkloadBenchmark() {
  checkBenchmarkEnv();
  console.log("🚀 Starting Enterprise Mixed Workload Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  await stabilize();

  const ITERATIONS = 2500;
  const WARMUP = 150;
  const RUNS = 3;

  const concurrencyLevels = [4, 8, 16];
  const allResults: any[] = [];

  for (const concurrency of concurrencyLevels) {
    console.log(`📌 Mixed workload @ concurrency ${concurrency}`);

    const typeStats = {
      read: [] as number[],
      graphql: [] as number[],
      write: [] as number[],
    };

    const result = await runBenchmark({
      name: `Mixed Workload @ ${concurrency}c`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      onSetup: stabilize,
      silent: true,
      onIteration: async () => {
        const op = pickWeighted();
        const start = performance.now();

        const opts: any = {
          path: op.path,
          method: op.method,
        };

        if (op.body) opts.body = op.body;
        if (op.bodyFn) opts.body = op.bodyFn();

        const res = await mockDispatch(opts);
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`${op.name} failed ${res.status}`);
        }
        await res.text();

        const ms = performance.now() - start;
        typeStats[op.type].push(ms);
      },
    });

    result.typeStats = {
      readAvg: typeStats.read.reduce((a, b) => a + b, 0) / (typeStats.read.length || 1),
      graphqlAvg: typeStats.graphql.reduce((a, b) => a + b, 0) / (typeStats.graphql.length || 1),
      writeAvg: typeStats.write.reduce((a, b) => a + b, 0) / (typeStats.write.length || 1),
    };

    allResults.push(result);
    exportResult(result);
  }

  logger.level = "info";

  console.log("\n" + "=".repeat(150));
  console.log("📊 SVELTYCMS MIXED WORKLOAD ENTERPRISE REPORT");
  console.log("Reads • GraphQL • Writes • Scaling • Memory");
  console.log("=".repeat(150));

  console.log(
    `| ${"Scenario".padEnd(28)} | ${"Avg".padEnd(12)} | ${"p95".padEnd(12)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(10)} |`,
  );
  console.log("|" + "-".repeat(145) + "|");

  for (const r of allResults) {
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

  const strongest = allResults[0];
  const heaviest = allResults[allResults.length - 1];

  console.log("\n✨ Insights:");
  console.log("• Traffic Mix = 65% Reads / 25% GraphQL / 10% Writes");
  console.log(`• Fastest scenario: ${strongest.name} (${strongest.avgMs.toFixed(2)} ms)`);
  console.log(`• Highest load scenario: ${heaviest.name}`);

  if (heaviest.typeStats.writeAvg > heaviest.avgMs * 1.8) {
    console.log(
      "• Writes significantly slower under pressure (DB lock or index contention likely).",
    );
  }
  if (heaviest.typeStats.graphqlAvg > heaviest.avgMs * 1.5) {
    console.log("• GraphQL overhead visible under mixed traffic.");
  }

  const avgMs = allResults.reduce((a, b) => a + b.avgMs, 0) / allResults.length;
  const maxRps = Math.max(...allResults.map((r) => r.rps));

  exportMetric("scale.mixed.avg", Number(avgMs.toFixed(3)), "ms");
  exportMetric("scale.mixed.rps", maxRps, "req/s");
  exportMetric("scale.mixed.write_ms", Number(heaviest.typeStats.writeAvg.toFixed(3)), "ms");
  exportMetric("scale.mixed.graphql_ms", Number(heaviest.typeStats.graphqlAvg.toFixed(3)), "ms");

  exportResult({
    name: "Mixed Workload Aggregate",
    avgMs: Number(avgMs.toFixed(3)),
    p95Ms: Math.max(...allResults.map((r) => r.p95Ms)),
    rps: Number(maxRps.toFixed(1)),
  });

  console.log("\n✅ Mixed workload benchmark completed.");
}

test("Mixed Workload Enterprise Suite", async () => {
  await runMixedWorkloadBenchmark();
}, 500000);
