/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description High-fidelity benchmark for SveltyCMS Hot Path (SDK vs Unified Dispatcher).
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const TEST_TENANT = "global";
const testEntryId = "latency-test-123";
let testCollection = "benchmark_posts";

const benchmarkSchema = {
  _id: "benchmark_posts",
  name: "benchmark_posts",
  fields: [
    { name: "title", type: "text", widget: { Name: "Input" } },
    { name: "content", type: "text", widget: { Name: "Input" } },
  ],
};

async function setupBenchmarkEnvironment() {
  const { getDb, getDbInitPromise } = await import("@src/databases/db");
  const { contentSystem } = await import("@src/content");
  const { LocalCMS } = await import("@src/routes/api/cms");

  console.log("🚀 Initializing API Latency Benchmark Environment...");

  await getDbInitPromise();
  const dbAdapter = getDb();
  if (!dbAdapter) throw new Error("DB not initialized");

  await contentSystem.initialize(TEST_TENANT, true, dbAdapter);
  const cms = new LocalCMS(dbAdapter);

  // Ensure collection exists
  let collections = contentSystem.getCollections(TEST_TENANT as any) || [];
  if (collections.length === 0) {
    if (dbAdapter.collection?.deleteModel) {
      try {
        await dbAdapter.collection.deleteModel(benchmarkSchema._id as any);
      } catch (_) {}
    }
    if (dbAdapter.collection?.createModel) {
      await dbAdapter.collection.createModel(benchmarkSchema as any);
    }
    await cms.collections.create("benchmark_posts" as any, benchmarkSchema as any, {
      system: true,
      tenantId: TEST_TENANT as any,
    });
    collections = contentSystem.getCollections(TEST_TENANT as any) || [];
  }

  testCollection = collections.length > 0 ? (collections[0]._id as string) : benchmarkSchema._id;

  console.log(`Seeding benchmark entry into ${testCollection}...`);
  const check = await cms.collections.findById(testCollection as any, testEntryId as any, {
    tenantId: TEST_TENANT as any,
    disableErrors: true,
  });
  if (!check.data) {
    await dbAdapter.crud.insert(
      `collection_${testCollection.replace(/-/g, "_")}`,
      {
        _id: testEntryId as any,
        title: "Latency Benchmark Entry",
        content: "Test content for performance auditing.",
        tenantId: TEST_TENANT as any,
      } as any,
      { tenantId: TEST_TENANT as any },
    );
  }

  return { cms, dbAdapter };
}

function createMockEvent(pathWithQuery: string, method = "GET") {
  const url = `http://localhost/api${pathWithQuery}`;
  return {
    request: new Request(url, { method, headers: { "x-tenant-id": TEST_TENANT } }),
    url: new URL(url),
    locals: { tenantId: TEST_TENANT, user: { _id: "admin" as any, role: "admin" } },
    cookies: { get: () => undefined },
    getClientAddress: () => "127.0.0.1",
    platform: {},
    params: {},
    route: { id: "/api/[...path]" },
  };
}

export async function runApiLatencyBenchmark() {
  const { cms } = await setupBenchmarkEnvironment();
  const { handleApiRequests } = await import("@src/hooks/handle-api-requests");

  logger.level = "silent";

  const iterations = 2500;
  const runs = 7;
  const warmUp = Math.floor(iterations * 0.15);

  // 1. SDK Core - Directly call LocalCMS (Raw Database Path)
  const sdkResult = await runBenchmark({
    name: "SDK: findById (Raw Core)",
    iterations,
    runs,
    warmupIterations: warmUp,
    onIteration: async () => {
      const res = await cms.collections.findById(testCollection as any, testEntryId as any, {
        tenantId: TEST_TENANT as any,
        bypassCache: true,
      });
      if (!res.success) throw new Error("SDK request failed");
    },
    silent: true,
  });

  // 2. Dispatcher Path - Unified entry point overhead
  const dispatcherResult = await runBenchmark({
    name: "Dispatcher: GET Collection Entry",
    iterations,
    runs,
    warmupIterations: warmUp,
    onIteration: async () => {
      const event = createMockEvent(`/collections/${testCollection}/${testEntryId}`) as any;
      const res = await handleApiRequests({
        event,
        resolve: async () => new Response("OK"),
      });
      if (res.status !== 200) throw new Error(`Dispatcher failed: ${res.status}`);
    },
    silent: true,
  });

  logger.level = "info";

  // Summary
  const overhead = dispatcherResult.avgMs - sdkResult.avgMs;
  const overheadUs = (overhead * 1000).toFixed(1);

  console.log("\n" + "=".repeat(85));
  console.log("   📊 SVELTYCMS DISPATCHER OVERHEAD AUDIT");
  console.log("=".repeat(85));
  console.log(
    `| ${"Layer".padEnd(25)} | ${"Avg (ms)".padEnd(12)} | ${"p95 (ms)".padEnd(12)} | ${"RPS".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(25 + 12 + 12 + 12 + 6) + "|");

  [sdkResult, dispatcherResult].forEach((r) => {
    console.log(
      `| ${r.name.padEnd(25)} | ${r.avgMs.toFixed(4).padEnd(12)} | ${r.p95Ms.toFixed(4).padEnd(12)} | ${Math.round(r.rps).toLocaleString().padEnd(12)} |`,
    );
  });
  console.log("=".repeat(85));
  console.log(`\n✨ Dispatcher logic adds ~${overheadUs}µs of overhead per request.`);

  exportResult(sdkResult);
  exportResult(dispatcherResult);
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("API Latency Audit (SDK vs Dispatcher)", async () => {
    await runApiLatencyBenchmark();
  }, 600000);
}
