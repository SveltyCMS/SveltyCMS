/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description Professional benchmark for SveltyCMS middleware / hook pipeline.
 * Measures individual hook overhead + realistic full pipeline latency.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";

async function stabilize() {
  if (typeof Bun !== "undefined") Bun.gc(true);
  await new Promise((r) => setTimeout(r, 15));
}

async function getHooks() {
  return {
    handleSetup: (await import("../../src/hooks/handle-setup")).handleSetup,
    handleTurboPipeline: (await import("../../src/hooks/handle-turbo-pipeline.server"))
      .handleTurboPipeline,
    handleCompression: (await import("../../src/hooks/handle-compression")).handleCompression,
    handleSecurity: (await import("../../src/hooks/handle-security")).handleSecurity,
    handleUserPreferences: (await import("../../src/hooks/handle-user-preferences"))
      .handleUserPreferences,
    handleAuthentication: (await import("../../src/hooks/handle-authentication"))
      .handleAuthentication,
    handleAuthorization: (await import("../../src/hooks/handle-authorization")).handleAuthorization,
    handleLocalSdk: (await import("../../src/hooks/handle-local-sdk")).handleLocalSdk,
    handleContentInitialization: (await import("../../src/hooks/handle-content-initialization"))
      .handleContentInitialization,
    handleApiRequests: (await import("../../src/hooks/handle-api-requests")).handleApiRequests,
    handleAuditLogging: (await import("../../src/hooks/handle-audit-logging")).handleAuditLogging,
    handleTokenResolution: (await import("../../src/hooks/token-resolution")).handleTokenResolution,
  };
}

function createMockEvent(path = "/"): any {
  const url = new URL(`http://localhost${path}`);
  return {
    url,
    request: new Request(url, { method: "GET" }),
    locals: { user: null, tenantId: "global" },
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
      serialize: () => "",
    },
    fetch: async () => new Response("OK", { status: 200 }),
    getClientAddress: () => "127.0.0.1",
    platform: {},
    isDataRequest: false,
    route: { id: path },
    params: {},
    setHeaders: () => {},
    // Add any other fields your hooks commonly access
  };
}

const resolve = async () => new Response("OK", { status: 200 });

test("Hook Pipeline Performance Suite", async () => {
  console.log("🛠️ Starting SveltyCMS Hook & Middleware Performance Benchmark...\n");

  const hooks = await getHooks();
  const results: any[] = [];
  const ITERATIONS = 3000; // Balanced: enough for good stats, fast enough to run often
  const WARMUP = 300;

  // Run each hook in isolation with fresh state
  for (const [hookName, hookFn] of Object.entries(hooks)) {
    console.log(`⏱️  Benchmarking hook: ${hookName}`);

    const result = await runBenchmark({
      name: hookName,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      onWarmup: async () => {
        const event = createMockEvent("/");
        try {
          await hookFn({ event, resolve });
        } catch {}
      },
      onIteration: async () => {
        // Fresh event every iteration to prevent cross-hook pollution
        const event = createMockEvent("/");
        try {
          await hookFn({ event, resolve });
        } catch {
          // Ignore expected errors (e.g. auth on public route)
        }
      },
    });

    results.push(result);
    exportResult(result, `hook-${hookName.toLowerCase()}.json`);

    await stabilize(); // Important: clean memory between hooks
  }

  // ========================
  // Realistic Full Pipeline Benchmark
  // ========================
  console.log("\n🚀 Benchmarking FULL Hook Pipeline (realistic order)...");

  const pipelineResult = await runBenchmark({
    name: "Full Hook Pipeline",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    onIteration: async () => {
      let event = createMockEvent("/");
      try {
        // Run hooks in typical execution order (adjust if your real order differs)
        for (const hookFn of Object.values(hooks)) {
          await hookFn({ event, resolve });
        }
      } catch {
        // Some hooks may short-circuit
      }
    },
  });

  exportResult(pipelineResult, "hook-pipeline-full.json");

  // ========================
  // Beautiful Summary
  // ========================
  console.log("\n" + "=".repeat(90));
  console.log("🏆 HOOK PERFORMANCE MATRIX (Individual + Pipeline)");
  console.log("=".repeat(90));

  console.log(
    `| ${"Hook".padEnd(28)} | ${"Avg (µs)".padEnd(10)} | ${"p95 (µs)".padEnd(10)} | ${"p99 (µs)".padEnd(10)} | ${"RPS".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(28 + 10 + 10 + 10 + 12 + 6) + "|");

  for (const r of results) {
    const avgUs = (r.avgMs * 1000).toFixed(2);
    const p95Us = (r.p95Ms * 1000).toFixed(2);
    const p99Us = (r.p99Ms * 1000).toFixed(2);
    console.log(
      `| ${r.name.padEnd(28)} | ${avgUs.padEnd(10)} | ${p95Us.padEnd(10)} | ${p99Us.padEnd(10)} | ${Math.floor(r.rps).toLocaleString().padEnd(12)} |`,
    );
  }

  // Pipeline row
  const pipeAvgUs = (pipelineResult.avgMs * 1000).toFixed(2);
  const pipeP95Us = (pipelineResult.p95Ms * 1000).toFixed(2);
  console.log("|" + "-".repeat(28 + 10 + 10 + 10 + 12 + 6) + "|");
  console.log(
    `| ${"FULL PIPELINE".padEnd(28)} | ${pipeAvgUs.padEnd(10)} | ${pipeP95Us.padEnd(10)} | ${"-".padEnd(10)} | ${Math.floor(pipelineResult.rps).toLocaleString().padEnd(12)} |`,
  );
  console.log("=".repeat(90));

  console.log(`\n📊 Total pipeline overhead: ${pipelineResult.avgMs.toFixed(4)} ms per request`);
  console.log(
    `   Expected max throughput: ~${Math.floor(pipelineResult.rps).toLocaleString()} req/sec (single-threaded)`,
  );
}, 600000);
