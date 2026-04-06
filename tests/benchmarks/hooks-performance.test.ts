/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description Professional high-resolution benchmark for SveltyCMS middleware hooks.
 * Uses benchmark-utils for p95, p99, and RPS metrics.
 */

// 1. Initialize Mocks
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import type { RequestEvent } from "@sveltejs/kit";

/**
 * Dynamically import hooks to ensure setup mocks are applied first.
 */
async function getHooks() {
  return {
    handleTurboPipeline: (await import("../../src/hooks/handle-turbo-pipeline.server"))
      .handleTurboPipeline,
    handleCompression: (await import("../../src/hooks/handle-compression")).handleCompression,
    handleSecurity: (await import("../../src/hooks/handle-security")).handleSecurity,
    handleSetup: (await import("../../src/hooks/handle-setup")).handleSetup,
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

const ITERATIONS = 10_000;
const MOCK_RESPONSE = new Response("OK", { status: 200 });

function createMockEvent(path: string): RequestEvent {
  const url = new URL(`http://localhost${path}`);
  return {
    url,
    request: new Request(url),
    locals: {},
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
      serialize: () => "",
    },
    fetch: async () => MOCK_RESPONSE.clone(),
    getClientAddress: () => "127.0.0.1",
    platform: {},
    isDataRequest: false,
    route: { id: path },
    params: {},
    isPasswordless: false,
  } as unknown as RequestEvent;
}

const resolve = async () => MOCK_RESPONSE.clone();

async function runHookBenchmarkSuite() {
  const hooks = await getHooks();
  const overallResults = [];

  console.log("🛠️  Starting Professional Hook Pipeline Benchmark Suite...");
  console.log(`   (Running ${ITERATIONS.toLocaleString()} iterations per hook)\n`);

  for (const [name, hook] of Object.entries(hooks)) {
    const result = await runBenchmark({
      name,
      iterations: ITERATIONS,
      warmupIterations: 500,
      silent: true,
      onIteration: async () => {
        const event = createMockEvent("/"); // Public path to avoid AuthError noise
        try {
          await hook({ event, resolve });
        } catch {
          // Expected errors
        }
      },
    });
    overallResults.push(result);
    // Standardized filename for individual hooks
    exportResult(result, `hook-${name.toLowerCase()}.json`);
  }

  // --- Summary Matrix ---
  console.log(
    "\n==========================================================================================",
  );
  console.log("🏁  MIDDLWARE PERFORMANCE MATRIX");
  console.log(
    "==========================================================================================",
  );

  // Custom high-resolution printer (prevents truncation and improves readability)
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  const head = `| ${pad("Hook", 24)} | ${pad("Avg (µs)", 10)} | ${pad("p95 (µs)", 10)} | ${pad("p99 (µs)", 10)} | ${pad("Throughput", 14)} |`;
  console.log(head);
  console.log(
    `|${"-".repeat(26)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(16)}|`,
  );

  for (const r of overallResults) {
    const row = `| ${pad(r.name, 24)} | ${pad((r.avgMs * 1000).toFixed(2), 10)} | ${pad((r.p95Ms * 1000).toFixed(2), 10)} | ${pad((r.p99Ms * 1000).toFixed(2), 10)} | ${pad(Math.floor(r.rps).toLocaleString(), 14)} |`;
    console.log(row);
  }
  console.log(
    "==========================================================================================\n",
  );

  // Calculate Pipeline Totals
  const totalAvg = overallResults.reduce((acc, r) => acc + r.avgMs, 0);
  const totalP95 = overallResults.reduce((acc, r) => acc + r.p95Ms, 0);
  const totalP99 = overallResults.reduce((acc, r) => acc + r.p99Ms, 0);

  const pipelineResult = {
    name: "Pipeline Overall",
    avgMs: totalAvg,
    p95Ms: totalP95,
    p99Ms: totalP99,
    rps: 1000 / totalAvg,
    timestamp: new Date().toISOString(),
    metrics: { avgMs: totalAvg, p95Ms: totalP95 },
  } as any;

  console.log(
    "==========================================================================================",
  );
  console.log("📊  AGGREGATE HOOK PIPELINE PERFORMANCE");
  console.log(
    "==========================================================================================",
  );
  console.log(`Avg Latency:  ${(totalAvg * 1000).toFixed(2)} µs (${totalAvg.toFixed(4)} ms)`);
  console.log(`p95 Latency:  ${(totalP95 * 1000).toFixed(2)} µs (${totalP95.toFixed(4)} ms)`);
  console.log(`Throughput:   ${Math.floor(1000 / totalAvg).toLocaleString()} req/sec`);
  console.log(
    "==========================================================================================\n",
  );

  exportResult(pipelineResult, "hook-pipeline.json");
}

import { test } from "bun:test";

test("Hook Pipeline Performance Suite", async () => {
  await runHookBenchmarkSuite();
}, 600000);
