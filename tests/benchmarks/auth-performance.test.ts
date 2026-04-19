/**
 * @file tests/benchmarks/auth-performance.test.ts
 * @description Enterprise authentication benchmark for SveltyCMS.
 * Measures session validation, RBAC resolution, and middleware overhead under multi-concurrency.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  mockDispatch,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runAuthBenchmark() {
  console.log("🚀 Starting Enterprise Auth & RBAC Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization, getDb } = await import("@src/databases/db");
  const { hasPermissionWithRoles } = await import("@src/databases/auth/permissions");

  await ensureFullInitialization();

  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const auth = db.auth;
  await stabilize();

  const RUNS = 3;
  const ITERATIONS = 1800;
  const WARMUP = 150;
  const concurrencyLevels = [1, 8, 32];
  const allResults: any[] = [];

  // 1. Session Validation
  for (const concurrency of concurrencyLevels) {
    const result = await runBenchmark({
      name: `Session Validation @ ${concurrency}c`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      tolerateErrors: true,
      silent: true,
      onSetup: stabilize,
      onIteration: async () => {
        await auth.validateSession("benchmark-session-id" as any);
      },
    });
    allResults.push(result);
  }

  // 2. Deep RBAC
  for (const concurrency of [1, 8]) {
    const result = await runBenchmark({
      name: `RBAC Resolution @ ${concurrency}c`,
      iterations: 1400,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      tolerateErrors: true,
      silent: true,
      onSetup: stabilize,
      onIteration: async () => {
        // Correct architecture call: Use the function directly
        hasPermissionWithRoles({ _id: "u123", role: "editor" } as any, "collections:create", [
          { _id: "editor", permissions: ["collections:create"] },
        ] as any);
      },
    });
    allResults.push(result);
  }

  // 3. Middleware
  for (const concurrency of concurrencyLevels) {
    const result = await runBenchmark({
      name: `Middleware Auth @ ${concurrency}c`,
      iterations: 1600,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      tolerateErrors: true,
      silent: true,
      onSetup: stabilize,
      onIteration: async () => {
        const res = await mockDispatch({
          path: "/api/user/me",
          headers: { authorization: "Bearer benchmark-token" },
        });
        await res.text();
      },
    });
    allResults.push(result);
  }

  logger.level = "info";

  console.log("\n" + "=".repeat(150));
  console.log("🔐 SVELTYCMS AUTH & RBAC ENTERPRISE REPORT");
  console.log("Sessions • Tokens • RBAC • Middleware • Scaling");
  console.log("=".repeat(150));

  console.log(
    `| ${"Scenario".padEnd(34)} | ${"Avg".padEnd(12)} | ${"p95".padEnd(12)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(10)} |`,
  );
  console.log("|" + "-".repeat(145) + "|");

  for (const r of allResults) {
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)}MB` : "—";
    console.log(
      `| ${r.name.padEnd(34)} | ` +
        `${r.avgMs.toFixed(3)} ms`.padEnd(12) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(10)} |`,
    );
  }
  console.log("=".repeat(150));

  // Insights
  const middleware1 = allResults.find((r) => r.name.includes("Middleware Auth @ 1c"));
  const middleware32 = allResults.find((r) => r.name.includes("Middleware Auth @ 32c"));
  const rbac = allResults.find((r) => r.name.includes("RBAC Resolution @ 1c"));

  console.log("\n✨ Insights:");
  if (middleware1)
    console.log(`• Middleware base cost: ${middleware1.avgMs.toFixed(3)} ms/request`);
  if (rbac) console.log(`• RBAC check cost: ${rbac.avgMs.toFixed(3)} ms`);
  if (middleware1 && middleware32) {
    const scalingLoss = ((middleware1.rps - middleware32.rps / 32) / middleware1.rps) * 100;
    console.log(`• Scaling efficiency loss: ${scalingLoss.toFixed(1)}%`);
  }

  const maxRps = Math.max(...allResults.map((r) => r.rps));
  exportMetric(
    "auth.session.avg",
    allResults.find((r) => r.name.includes("Session Validation @ 1c"))?.avgMs || 0,
    "ms",
  );
  exportMetric("auth.middleware.avg", middleware1?.avgMs || 0, "ms", {
    p95: middleware1?.p95Ms || 0,
  });
  exportMetric("auth.rbac.avg", rbac?.avgMs || 0, "ms");
  exportMetric("auth.max_rps", maxRps, "req/s");

  exportResult({
    name: "Auth Aggregate",
    avgMs: middleware1?.avgMs || 0,
    p95Ms: middleware1?.p95Ms || 0,
    rps: maxRps,
  });

  for (const r of allResults) exportResult(r);

  console.log("\n✅ Auth benchmark completed.");
}

test("Auth & RBAC Enterprise Suite", async () => {
  await runAuthBenchmark();
}, 450000);
