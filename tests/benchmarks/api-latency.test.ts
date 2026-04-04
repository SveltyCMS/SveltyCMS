/**
 * @file tests/benchmarks/api-latency.bench.ts
 * @description
 * Professional benchmark comparing Traditional HTTP dispatch (via unified gateway)
 * vs Direct Local SDK access using benchmark-utils.
 */

// 1. Initialize Mocks
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";

async function runApiBenchmark() {
  console.log("🚀 Starting SveltyCMS Professional API Performance Benchmark...");

  // Dynamic imports to ensure mocks are applied
  const { dbAdapter, getDbInitPromise } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const { _handler: dispatcher } = await import("@src/routes/api/[...path]/+server");
  const { contentManager } = await import("@src/content");

  await getDbInitPromise();
  if (!dbAdapter) throw new Error("DB not initialized");

  console.log("📦 Initializing content manager...");
  await contentManager.initialize("global", false, dbAdapter);

  const collections = await contentManager.getCollections();
  const cms = new LocalCMS(dbAdapter);
  const iterations = 500;

  if (collections.length === 0) {
    console.warn("⚠️ No user collections found. Using internal 'auth' fallback for benchmark.");
    await benchmarkAuth(cms, dispatcher);
    return;
  }

  const targetCollection = collections[0]._id as string;
  console.log(`📊 Benchmarking against collection: "${targetCollection}"`);

  // 1. DIRECT SDK PERFORMANCE
  const sdkResult = await runBenchmark({
    name: `Local SDK: find(${targetCollection})`,
    iterations,
    onIteration: async () => {
      await cms.collections.find(targetCollection, { limit: 10 });
    },
  });
  exportResult(sdkResult);

  // 2. UNIFIED DISPATCHER PERFORMANCE (Simulated HTTP)
  const dispatchResult = await runBenchmark({
    name: `HTTP Dispatcher: /api/collections/${targetCollection}`,
    iterations,
    onIteration: async () => {
      const mockEvent = {
        request: new Request(`http://localhost/api/collections/${targetCollection}`),
        params: { path: `collections/${targetCollection}` },
        locals: { user: { _id: "admin", role: "admin" }, tenantId: "global" },
        cookies: { get: () => null, set: () => {}, delete: () => {} },
      } as any;
      await dispatcher(mockEvent);
    },
  });
  exportResult(dispatchResult);

  printSummary(sdkResult, dispatchResult);
  process.exit(0);
}

async function benchmarkAuth(cms: any, dispatcher: any) {
  const iterations = 500;
  const credentials = { email: "admin@example.com" };

  const sdkResult = await runBenchmark({
    name: "Local SDK: auth.login",
    iterations,
    onIteration: async () => {
      try {
        await cms.auth.login(credentials);
      } catch {}
    },
  });

  const dispatchResult = await runBenchmark({
    name: "HTTP Dispatcher: /api/auth/login",
    iterations,
    onIteration: async () => {
      const mockEvent = {
        request: new Request("http://localhost/api/auth/login", {
          method: "POST",
          body: JSON.stringify(credentials),
        }),
        params: { path: "auth/login" },
        locals: { user: null, tenantId: "global" },
        cookies: { get: () => null, set: () => {}, delete: () => {} },
      } as any;
      await dispatcher(mockEvent).catch(() => {});
    },
  });

  printSummary(sdkResult, dispatchResult);
  process.exit(0);
}

function printSummary(sdk: any, dispatch: any) {
  const speedup = (dispatch.avgMs / sdk.avgMs).toFixed(2);
  console.log("\n============================================");
  console.log("   SveltyCMS ARCHITECTURAL SUMMARY        ");
  console.log("============================================");
  console.log(`Local SDK p95:        ${sdk.p95Ms.toFixed(4)} ms`);
  console.log(`HTTP Dispatch p95:    ${dispatch.p95Ms.toFixed(4)} ms`);
  console.log(`Total Speedup (Avg):  ${speedup}x faster`);
  console.log("============================================");
}

import { test } from "bun:test";

test("API Latency (SDK vs HTTP) Performance Suite", async () => {
  await runApiBenchmark();
}, 600000);
