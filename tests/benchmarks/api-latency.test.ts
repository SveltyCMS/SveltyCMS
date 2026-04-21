/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description Enterprise API overhead benchmark for SveltyCMS.
 * Measures the precise cost of the middleware stack and dispatcher compared to direct SDK calls.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  mockDispatch,
  setupBenchmarkServer,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const TEST_COLLECTION = "benchmark_posts_api";
const TEST_ENTRY_ID = "latency-test-123";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
  await setupBenchmarkEnvironment();
});

afterAll(async () => {
  if (stopServer) await stopServer();

  // 🧹 Final Cleanup
  const { getDb } = await import("@src/databases/db");
  const { contentSystem } = await import("@src/content");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const db = getDb();
  const compiledDir = path.join(process.cwd(), ".compiledCollections");
  await fs.rm(path.join(compiledDir, `${TEST_COLLECTION}.js`), { force: true });

  if (db?.collection?.deleteModel) {
    await db.collection.deleteModel(TEST_COLLECTION).catch(() => {});
  }

  // Force a final refresh to remove from memory
  await contentSystem.initialize(null, { skipReconciliation: false }).catch(() => {});
  console.log("\n✅ API Latency benchmark artifacts purged.");
});

async function setupBenchmarkEnvironment() {
  console.log("🚀 Preparing API Benchmark Environment...");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database adapter missing");

  const cms = new LocalCMS(db);

  const prev = logger.level;
  logger.level = "silent";

  try {
    const schema = {
      _id: TEST_COLLECTION,
      name: TEST_COLLECTION,
      fields: [{ name: "title", type: "text", widget: { Name: "Input" } }],
    };

    // 🚀 Scaffold the schema file to ensure it's discovered by the content system
    const compiledDir = path.join(process.cwd(), ".compiledCollections");
    await fs.mkdir(compiledDir, { recursive: true });
    await fs.writeFile(
      path.join(compiledDir, `${TEST_COLLECTION}.js`),
      `export default ${JSON.stringify(schema, null, 2)};`,
    );

    const { contentSystem } = await import("@src/content");
    // Force a reload to pick up the new file
    await contentSystem.initialize(null, { skipReconciliation: false });

    // 🚀 Robust Cleanup: Ensure we start with a clean collection
    if (db.collection?.deleteModel) {
      await db.collection.deleteModel(TEST_COLLECTION).catch(() => {});
    }

    if (db.collection?.createModel) {
      await db.collection.createModel(schema as any).catch(() => {});
    }

    // Clear any existing entries just in case
    await db.crud.deleteMany?.(TEST_COLLECTION, {}, { tenantId: null as any }).catch(() => {});

    await cms.collections.create(
      TEST_COLLECTION as any,
      { _id: TEST_ENTRY_ID, title: "Latency Benchmark" },
      { system: true, tenantId: null as any },
    );
  } finally {
    logger.level = prev;
  }
}

export async function runApiLatencyBenchmark() {
  const { getDb } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");

  const db = getDb();
  if (!db) throw new Error("Database adapter not initialized for benchmark");
  const cms = new LocalCMS(db);

  await stabilize();

  logger.level = "silent";
  console.log("\n🚀 Starting Enterprise API Latency Benchmark...\n");

  const RUNS = 3;
  const ITERATIONS = 1000;
  const WARMUP = 100;
  const concurrencyLevels = [1, 8];
  const allResults: any[] = [];

  const scenarios = [
    {
      name: "findById",
      sdk: async () =>
        cms.collections.find(TEST_COLLECTION as any, { _id: TEST_ENTRY_ID, tenantId: null as any }),
      dispatch: { path: `/collections/${TEST_COLLECTION}/${TEST_ENTRY_ID}`, method: "GET" },
    },
    {
      name: "list limit=10",
      sdk: async () =>
        cms.collections.find(TEST_COLLECTION as any, { tenantId: null as any, limit: 10 }),
      dispatch: { path: `/collections/${TEST_COLLECTION}?limit=10`, method: "GET" },
    },
  ];

  for (const scenario of scenarios) {
    for (const concurrency of concurrencyLevels) {
      console.log(`📌 ${scenario.name} @ ${concurrency}c`);

      const sdkRes = await runBenchmark({
        name: `SDK ${scenario.name} @ ${concurrency}c`,
        iterations: ITERATIONS,
        warmupIterations: WARMUP,
        runs: RUNS,
        concurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onSetup: stabilize,
        onIteration: async () => {
          await scenario.sdk();
        },
      });

      const dispRes = await runBenchmark({
        name: `Dispatcher ${scenario.name} @ ${concurrency}c`,
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
          await mockDispatch(scenario.dispatch as any);
        },
      });

      const overhead = Math.max(0, dispRes.avgMs - sdkRes.avgMs);
      const overheadPct = sdkRes.avgMs > 0 ? (overhead / sdkRes.avgMs) * 100 : 0;

      allResults.push({ ...sdkRes, layer: "SDK", pair: scenario.name });
      allResults.push({
        ...dispRes,
        layer: "Dispatcher",
        pair: scenario.name,
        overhead,
        overheadPct,
      });
    }
  }

  logger.level = "info";

  console.log("\n" + "=".repeat(120));
  console.log("   📊 SVELTYCMS API LAYER ENTERPRISE REPORT");
  console.log("=".repeat(120));

  for (const r of allResults) {
    const over =
      r.layer === "Dispatcher" ? `${r.overhead.toFixed(3)} ms (${r.overheadPct.toFixed(1)}%)` : "—";
    console.log(
      `| ${r.name.replace("SDK ", "").replace("Dispatcher ", "").padEnd(24)} | ` +
        `${r.layer.padEnd(12)} | ` +
        `${r.avgMs.toFixed(3)} ms`.padEnd(12) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${over.padEnd(24)} |`,
    );
  }
  console.log("=".repeat(120));

  const dispatcher1 = allResults.find(
    (r) => r.layer === "Dispatcher" && r.name.includes("findById @ 1c"),
  );

  const overheads = allResults.filter((r) => r.layer === "Dispatcher").map((r) => r.overhead);
  const avgOverhead = overheads.reduce((a, b) => a + b, 0) / overheads.length;
  const maxRps = Math.max(...allResults.map((r) => r.rps));

  exportMetric("rest.collections.avg", dispatcher1?.avgMs || 0, "ms");
  exportMetric("rest.collections.p95", dispatcher1?.p95Ms || 0, "ms");
  exportMetric("rest.collections.rps", maxRps, "req/s");
  exportMetric("rest.overhead.avg", avgOverhead, "ms");

  const aggregate = {
    name: "API Latency Summary",
    avgMs: avgOverhead,
    p95Ms: dispatcher1?.p95Ms || 0,
    rps: maxRps,
    shortLabel: "API Latency",
  };

  exportResult(aggregate);
  console.log("\n✅ API benchmark completed.");
}

test("API Latency Enterprise Suite", async () => {
  await runApiLatencyBenchmark();
}, 450000);
