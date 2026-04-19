/**
 * @file tests/benchmarks/relational-performance.test.ts
 * @description Enterprise relational / GraphQL benchmark for SveltyCMS.
 * Measures resolver scaling, nested population, and concurrency contention.
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

type QueryDef = {
  name: string;
  query: string;
  iterations: number;
  warmup: number;
};

export async function runRelationalBenchmark() {
  checkBenchmarkEnv();
  console.log("🚀 Starting Enterprise Relational GraphQL Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  const { contentSystem } = await import("@src/content");

  await ensureFullInitialization();
  await stabilize();

  const collections = contentSystem.getCollections("global") || [];
  const authorCol = collections.find((c: any) => c.name === "Authors");
  const postCol = collections.find((c: any) => c.name === "Posts");

  const authorId = authorCol?._id || "Authors";
  const postId = postCol?._id || "Posts";

  const RUNS = 3;

  const queries: QueryDef[] = [
    {
      name: "GraphQL Introspection",
      iterations: 100,
      warmup: 10,
      query: `
        {
          __schema {
            queryType { fields { name } }
          }
        }
      `,
    },
    {
      name: "Deep Relational (Depth 2)",
      iterations: 600,
      warmup: 60,
      query: `
        query {
          ${authorId}(limit: 5) {
            _id
            name
            ${postId}(limit: 10) {
              _id
              title
            }
          }
        }
      `,
    },
    {
      name: "Heavy Relational (Depth 3)",
      iterations: 400,
      warmup: 40,
      query: `
        query {
          ${authorId}(limit: 5) {
            _id
            name
            ${postId}(limit: 10) {
              _id
              title
            }
          }
        }
      `,
    },
  ];

  const concurrencyLevels = [1, 4, 8];
  const allResults: any[] = [];

  for (const q of queries) {
    for (const concurrency of concurrencyLevels) {
      console.log(`📌 ${q.name} @ concurrency ${concurrency}`);

      const result = await runBenchmark({
        name: `${q.name} @ ${concurrency}c`,
        iterations: q.iterations,
        warmupIterations: q.warmup,
        runs: RUNS,
        concurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onSetup: stabilize,
        onIteration: async () => {
          const res = await mockDispatch({
            path: "/graphql",
            method: "POST",
            body: { query: q.query },
          });

          if (res.status !== 200) {
            const text = await res.text().catch(() => "");
            throw new Error(`GraphQL ${res.status}: ${text.slice(0, 200)}`);
          }
          await res.text();
        },
      });

      allResults.push(result);
      exportResult(result);
    }
  }

  logger.level = "info";

  console.log("\n" + "=".repeat(150));
  console.log("📊 SVELTYCMS RELATIONAL / GRAPHQL ENTERPRISE REPORT");
  console.log("Resolvers • Nested Population • Join Scaling • Memory");
  console.log("=".repeat(150));

  console.log(
    `| ${"Query".padEnd(42)} | ${"Avg".padEnd(14)} | ${"p95".padEnd(12)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(145) + "|");

  for (const r of allResults) {
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)}MB` : "—";
    console.log(
      `| ${r.name.padEnd(42)} | ` +
        `${r.avgMs.toFixed(3)} ms`.padEnd(14) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(150));

  // Analytics
  const deep1 = allResults.find((r) => r.name.includes("Deep Relational (Depth 2) @ 1c"));
  const deep8 = allResults.find((r) => r.name.includes("Deep Relational (Depth 2) @ 8c"));
  const heavy = allResults.find((r) => r.name.includes("Heavy Relational"));

  console.log("\n✨ Insights:");
  if (deep1 && deep8) {
    const scaling = ((deep1.rps - deep8.rps / 8) / deep1.rps) * 100;
    console.log(`• Concurrency scaling loss: ${scaling.toFixed(1)}%`);
    if (scaling > 35) {
      console.log("• Likely DB pool bottleneck or resolver serialization.");
    }
  }
  if (heavy) {
    console.log(`• Heavy nested query avg: ${heavy.avgMs.toFixed(2)} ms`);
    if (heavy.avgMs > 25) {
      console.log("• Deep population likely causing N+1 or large hydration overhead.");
    }
  }

  const avgMs = allResults.reduce((a, b) => a + b.avgMs, 0) / allResults.length;
  const maxP95 = Math.max(...allResults.map((r) => r.p95Ms));
  const maxRps = Math.max(...allResults.map((r) => r.rps));

  exportMetric("logic.relational.avg", Number(avgMs.toFixed(3)), "ms", { p95: maxP95, maxRps });
  exportMetric("logic.relational.max_rps", maxRps, "req/s");

  exportResult({
    name: "Relational Aggregate",
    avgMs: Number(avgMs.toFixed(3)),
    p95Ms: Number(maxP95.toFixed(3)),
    rps: Number(maxRps.toFixed(1)),
  });

  console.log("\n✅ Relational GraphQL benchmark completed.");
}

test("Relational GraphQL Performance Suite", async () => {
  await runRelationalBenchmark();
}, 450000);
