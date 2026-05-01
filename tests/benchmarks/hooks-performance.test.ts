/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description Enterprise Hooks & Middleware benchmark for SveltyCMS.
 * Measures the cost of the middleware chain (Turbo, Security, Auth, Audit) via HTTP E2E.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  ensureStableTestData,
  TEST_API_SECRET,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();

  // Wait for system to reach READY/WARMED state
  const { isSystemReady } = await import("@src/stores/system/state");
  let attempts = 0;
  while (!isSystemReady() && attempts < 10) {
    console.log(`   ⏳ Waiting for system readiness (attempt ${attempts + 1})...`);
    await new Promise((r) => setTimeout(r, 1000));
    attempts++;
  }

  await ensureStableTestData(db!);

  // Wait for server to reach READY/WARMED state (External check)
  console.log("   🚀 Waiting for server to reach READY state (up to 120s)...");
  let ready = false;
  attempts = 0;
  while (!ready && attempts < 120) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/system/health`);
      const data = await res.json();
      if (res.status === 200 && (data.status === "READY" || data.status === "WARMED")) {
        ready = true;
        console.log("   ✅ Server is READY. Waiting 2s for stabilization...");
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        if (attempts % 5 === 0) {
          console.log(
            `   ⏳ Server status: ${res.status}, State: ${data.status || "UNKNOWN"}. Retrying... (${attempts}/120)`,
          );
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch {
      if (attempts % 5 === 0) {
        console.log(`   ⏳ Server not reachable yet. Retrying... (${attempts}/120)`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    attempts++;
  }

  if (!ready) {
    throw new Error("Server failed to reach READY state after 120s");
  }
}, 180000);

afterAll(async () => {
  if (stopServer) await stopServer();
});

async function runHooksAudit() {
  console.log("🚀 Starting Enterprise Hooks & Middleware Audit (E2E)...\n");

  const ITERATIONS = 500;
  const RUNS = 2;
  const results: any[] = [];

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Turbo Pipeline (Short-circuit)
    // Measuring a static asset or internal route that bypasses full logic but hits hooks
    console.log("   → Measuring Turbo Pipeline (Static-ish)...");
    const turboRes = await runBenchmark({
      name: "Turbo Pipeline (Static)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 8,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${apiBaseUrl}/api/system/health`, {
          headers: { "x-test-mode": "true" },
        });
        await res.json();
      },
    });
    results.push({ ...turboRes, layer: "Middleware" });

    // 2. Full Security & Auth Chain
    console.log("   → Measuring Security & Auth Middleware Tax...");
    const fullRes = await runBenchmark({
      name: "Security + Auth Pipeline",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 8,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
            },
          },
        );
        await res.json();
      },
    });
    results.push({ ...fullRes, layer: "Middleware" });

    // 3. Audit Logging (Mutation Path)
    console.log("   → Measuring Audit Logging Middleware (POST)...");
    const auditRes = await runBenchmark({
      name: "Audit Logging (Mutation)",
      iterations: 100,
      warmupIterations: 10,
      runs: 1,
      concurrency: 1,
      silent: true,
      onIteration: async (i: number) => {
        const res = await fetch(`${apiBaseUrl}/api/collections/${STABLE_COLLECTION}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
          },
          body: JSON.stringify({
            _id: `hook-bench-${i}-${Math.random().toString(36).slice(2)}`,
            title: "Hook Test",
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Audit hook failed: ${res.status}. Body: ${body}`);
        }
        await res.json();
      },
    });
    results.push({ ...auditRes, layer: "Middleware" });

    printTruthTable({
      title: "SVELTYCMS  —  MIDDLEWARE INFRASTRUCTURE AUDIT",
      subtitle: "Turbo • Security • Auth • Audit Logging • E2E Pipeline",
      results,
    });

    printSummaryTable([
      { key: "Turbo Latency (Avg)", val: turboRes.avgMs, unit: "ms" },
      { key: "Auth Pipeline Latency", val: fullRes.avgMs, unit: "ms" },
      { key: "Audit Log Overhead", val: (auditRes.avgMs - fullRes.avgMs).toFixed(2), unit: "ms" },
      { key: "Peak Middleware RPS", val: Math.round(fullRes.rps), unit: "req/s" },
    ]);

    for (const r of results) exportResult(r);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Hooks & middleware audit completed.");
}

test("Hooks & Middleware Enterprise Audit", async () => {
  await runHooksAudit();
}, 450000);
