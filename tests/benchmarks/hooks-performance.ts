/**
 * @file tests/benchmarks/hooks-performance.ts
 * @description High-resolution benchmark for real SveltyCMS middleware hooks.
 * Measures execution time of each individual hook in the pipeline.
 */

// 1. Initialize Mocks (Critical for running hooks outside SvelteKit)
import "../unit/setup.ts";
import { performance } from "node:perf_hooks";
import type { RequestEvent } from "@sveltejs/kit";

/**
 * Dynamically import hooks to ensure setup mocks are applied first.
 */
async function getHooks() {
  return {
    addSecurityHeaders: (await import("../../src/hooks/add-security-headers")).addSecurityHeaders,
    handleTestIsolation: (await import("../../src/hooks/handle-test-isolation"))
      .handleTestIsolation,
    handleStaticAssetCaching: (await import("../../src/hooks/handle-static-asset-caching"))
      .handleStaticAssetCaching,
    handleCompression: (await import("../../src/hooks/handle-compression")).handleCompression,
    handleSystemState: (await import("../../src/hooks/handle-system-state")).handleSystemState,
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

/**
 * Creates a fresh mock event for each iteration.
 */
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

/**
 * Main benchmark execution logic.
 */
async function runBenchmark() {
  console.log(`\n🚀 SveltyCMS Hook Pipeline Performance – ${new Date().toISOString()}`);
  console.log(`Iterations per hook: ${ITERATIONS.toLocaleString()}\n`);

  const hooks = await getHooks();
  const results: {
    "Hook Name": string;
    "Avg (µs)": string;
    "Total (ms)": string;
  }[] = [];

  for (const [name, hook] of Object.entries(hooks)) {
    // Warmup
    const warmupEvent = createMockEvent("/api/collections");
    for (let i = 0; i < 100; i++) {
      try {
        await hook({ event: warmupEvent, resolve });
      } catch {
        /* Ignore */
      }
    }

    // Benchmark
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const event = createMockEvent("/api/collections");
      try {
        await hook({ event, resolve });
      } catch {
        // Expected errors due to mock/redirect/abort
      }
    }
    const end = performance.now();

    const totalMs = end - start;
    const avgMicro = (totalMs * 1000) / ITERATIONS;

    results.push({
      "Hook Name": name,
      "Avg (µs)": avgMicro.toFixed(4),
      "Total (ms)": totalMs.toFixed(2),
    });
  }

  // Sort by execution time (slowest first)
  results.sort((a, b) => parseFloat(b["Avg (µs)"]) - parseFloat(a["Avg (µs)"]));

  console.table(results);

  const totalAvg = results.reduce((acc, r) => acc + parseFloat(r["Avg (µs)"]), 0);
  console.log("\n-----------------------------------------------------------");
  console.log(
    `🏁 Estimated Pipeline Latency: ${totalAvg.toFixed(2)} µs (${(totalAvg / 1000).toFixed(3)} ms)`,
  );
  console.log(
    `📊 Max Throughput (theoretical): ${Math.floor(1000000 / totalAvg).toLocaleString()} req/sec`,
  );
  console.log("-----------------------------------------------------------");
  console.log("✅ Benchmark complete.");
  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error("❌ Benchmark failed:", err);
  process.exit(1);
});
