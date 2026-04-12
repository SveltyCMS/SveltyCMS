/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description
 * Professional benchmark comparing Traditional HTTP dispatch (via unified gateway)
 * vs Direct Local SDK access using the professional benchmark-utils.
 */

import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";

async function runApiBenchmark() {
  console.log("🚀 Starting professional SveltyCMS API Performance Benchmark...");

  const { dbAdapter, getDbInitPromise } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const { _handler: dispatcher } = await import("@src/routes/api/[...path]/+server");
  const { contentSystem } = await import("@src/content");

  await getDbInitPromise();
  if (!dbAdapter) throw new Error("DB not initialized");

  await contentSystem.initialize("global", false, dbAdapter);

  const collections = await contentSystem.getCollections();
  const cms = new LocalCMS(dbAdapter);
  const iterations = 800; // Increased sample size

  if (collections.length === 0) {
    console.warn("⚠️ No user collections found. Using internal 'auth' fallback for benchmark.");
    await benchmarkAuth(cms, dispatcher);
    return;
  }

  const targetCollection = collections[0]._id as string;
  console.log(`📊 Targeting collection: "${targetCollection}"`);

  // --- 1. DIRECT SDK PERFORMANCE ---
  const sdkResult = await runBenchmark({
    name: `Local SDK: find(${targetCollection})`,
    iterations,
    runs: 3,
    onIteration: async () => {
      await cms.collections.find(targetCollection, { limit: 10 });
    },
  });
  exportResult(sdkResult);

  // --- 2. HTTP DISPATCHER PERFORMANCE (Realistic RequestEvent Mock) ---
  const baseUrl = "http://localhost";
  const dispatchResult = await runBenchmark({
    name: `HTTP Dispatcher: /api/collections/${targetCollection}`,
    iterations,
    runs: 3,
    onIteration: async () => {
      const mockRequest = new Request(`${baseUrl}/api/collections/${targetCollection}?limit=10`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const mockEvent = {
        request: mockRequest,
        url: new URL(mockRequest.url),
        params: { path: `collections/${targetCollection}` },
        route: { id: "/api/collections/[...path]" },
        locals: { user: { _id: "admin", role: "admin" }, tenantId: "global" },
        cookies: {
          get: () => null,
          getAll: () => [],
          set: () => {},
          delete: () => {},
        },
        fetch: globalThis.fetch,
        setHeaders: () => {},
        isDataRequest: false,
        getClientAddress: () => "127.0.0.1",
        platform: {},
      } as any;

      await dispatcher(mockEvent);
    },
  });
  exportResult(dispatchResult);

  printImprovedSummary(sdkResult, dispatchResult);
}

async function benchmarkAuth(cms: any, dispatcher: any) {
  const iterations = 800;
  const credentials = { email: "admin@example.com" };

  const sdkResult = await runBenchmark({
    name: "Local SDK: auth.login",
    iterations,
    runs: 3,
    onIteration: async () => {
      try {
        await cms.auth.login(credentials);
      } catch {}
    },
  });

  const baseUrl = "http://localhost";
  const dispatchResult = await runBenchmark({
    name: "HTTP Dispatcher: /api/auth/login",
    iterations,
    runs: 3,
    onIteration: async () => {
      const mockRequest = new Request(`${baseUrl}/api/auth/login`, {
        method: "POST",
        body: JSON.stringify(credentials),
        headers: { "Content-Type": "application/json" },
      });

      const mockEvent = {
        request: mockRequest,
        url: new URL(mockRequest.url),
        params: { path: "auth/login" },
        route: { id: "/api/auth/login" },
        locals: { user: null, tenantId: "global" },
        cookies: {
          get: () => null,
          getAll: () => [],
          set: () => {},
          delete: () => {},
        },
        fetch: globalThis.fetch,
        setHeaders: () => {},
        isDataRequest: false,
        getClientAddress: () => "127.0.0.1",
        platform: {},
      } as any;

      await dispatcher(mockEvent).catch(() => {});
    },
  });

  printImprovedSummary(sdkResult, dispatchResult);
}

function printImprovedSummary(sdk: any, dispatch: any) {
  const avgSpeedup = (dispatch.avgMs / sdk.avgMs).toFixed(2);
  const p95Speedup = (dispatch.p95Ms / sdk.p95Ms).toFixed(2);

  console.log("\n" + "=".repeat(60));
  console.log("   SveltyCMS ARCHITECTURAL PERFORMANCE SUMMARY");
  console.log("=".repeat(60));
  console.log(`Local SDK     - Avg: ${sdk.avgMs.toFixed(4)} ms | p95: ${sdk.p95Ms.toFixed(4)} ms`);
  console.log(
    `HTTP Dispatch - Avg: ${dispatch.avgMs.toFixed(4)} ms | p95: ${dispatch.p95Ms.toFixed(4)} ms`,
  );
  console.log("------------------------------------------------------------");
  console.log(`Avg Speedup:  ${avgSpeedup}x faster (SDK vs HTTP Overhead)`);
  console.log(`p95 Speedup:  ${p95Speedup}x faster`);
  console.log("=".repeat(60) + "\n");
}

import { test } from "bun:test";

test("API Latency (SDK vs HTTP) Performance Suite", async () => {
  await runApiBenchmark();
}, 600000);
