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
    locals: { user: { _id: "admin", role: "admin" }, tenantId: "global" },
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
  };
}

const resolve = async () => new Response("OK", { status: 200 });

export async function runHooksBenchmark() {
  console.log("🛠️ Starting SveltyCMS Hook & Middleware Performance Benchmark...\n");

  const hooks = await getHooks();
  const results: any[] = [];
  const ITERATIONS = 3000;
  const WARMUP = 300;

  // Run each hook in isolation
  for (const [hookName, hookFn] of Object.entries(hooks)) {
    console.log(`⏱️  Benchmarking hook: ${hookName}`);

    const result = await runBenchmark({
      name: hookName,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      onIteration: async () => {
        const event = createMockEvent("/");
        try {
          await hookFn({ event, resolve });
        } catch {}
      },
      silent: true,
    });

    results.push(result);
    exportResult(result, `hook-${hookName.toLowerCase()}.json`);
    await stabilize();
  }

  // Realistic Full Pipeline (only hot-path hooks)
  console.log("\n🚀 Benchmarking FULL Hook Pipeline (realistic hot path)...");

  const hotPathHooks = [
    hooks.handleTurboPipeline,
    hooks.handleCompression,
    hooks.handleSecurity,
    hooks.handleAuthentication,
    hooks.handleAuthorization,
    hooks.handleLocalSdk,
    hooks.handleApiRequests,
  ];

  const pipelineResult = await runBenchmark({
    name: "Full Hook Pipeline (Hot Path)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 1,
    onIteration: async () => {
      let event = createMockEvent("/");
      try {
        for (const hookFn of hotPathHooks) {
          await hookFn({ event, resolve });
        }
      } catch {}
    },
    silent: true,
  });

  exportResult(pipelineResult, "hook-pipeline-full.json");

  // Summary Table
  console.log("\n" + "=".repeat(90));
  console.log("🏆 HOOK PERFORMANCE MATRIX (Individual + Pipeline)");
  console.log("=".repeat(90));
  console.log(
    `| ${"Hook".padEnd(32)} | ${"Avg (µs)".padEnd(10)} | ${"p95 (µs)".padEnd(10)} | ${"RPS".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(32 + 10 + 10 + 12 + 6) + "|");

  for (const r of results) {
    const avgUs = (r.avgMs * 1000).toFixed(2);
    const p95Us = (r.p95Ms * 1000).toFixed(2);
    console.log(
      `| ${r.name.padEnd(32)} | ${avgUs.padEnd(10)} | ${p95Us.padEnd(10)} | ${Math.floor(r.rps).toLocaleString().padEnd(12)} |`,
    );
  }

  const pipeAvgUs = (pipelineResult.avgMs * 1000).toFixed(2);
  const pipeP95Us = (pipelineResult.p95Ms * 1000).toFixed(2);
  console.log("|" + "-".repeat(32 + 10 + 10 + 12 + 6) + "|");
  console.log(
    `| ${"FULL PIPELINE (Hot Path)".padEnd(32)} | ${pipeAvgUs.padEnd(10)} | ${pipeP95Us.padEnd(10)} | ${Math.floor(pipelineResult.rps).toLocaleString().padEnd(12)} |`,
  );
  console.log("=".repeat(90));

  console.log(`\n📊 Total pipeline overhead: ${pipelineResult.avgMs.toFixed(4)} ms per request`);
  console.log(
    `   Expected max throughput: ~${Math.floor(pipelineResult.rps).toLocaleString()} req/sec`,
  );
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Hook Pipeline Performance Suite", async () => {
    await runHooksBenchmark();
  }, 600000);
}
