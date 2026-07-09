/**
 * @file tests/benchmarks/virtual-query-federation.test.ts
 * @description Phase 0 benchmark — virtual query passthrough engine overhead.
 *
 * Measures LocalCMS virtualCollections path with mocked REST connector.
 * Live Postgres leg runs on each CMS adapter in the benchmark matrix (sqlite,
 * mongodb, mariadb, postgresql) with an external Docker Postgres connector fixture.
 * Record with: BENCHMARK_RECORD=1 bun test tests/benchmarks/virtual-query-federation.test.ts
 */

import { test, runBenchmark, getDbType, printTruthTable } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { vi } from "vitest";

vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: vi.fn(async () => ({
    active: true,
    hasLicense: true,
    daysRemaining: null,
  })),
}));

async function runVirtualFederationBenchmark() {
  console.log(`🚀 Virtual Query Federation POC Benchmark (${getDbType().toUpperCase()})...\n`);

  const { executeVirtualRead } =
    await import("@plugins/unified-data-hub/server/virtual-query-engine");
  const { buildWordPressVirtualCollection, getWordPressRestEndpoint } =
    await import("@plugins/unified-data-hub/server/shared-schema/wordpress-rest");

  const TENANT = "default";
  const CONNECTOR_ID = "bench-conn";
  const COLLECTION_ID = "bench-vc";

  const connector = {
    _id: CONNECTOR_ID,
    tenantId: TENANT,
    name: "Bench REST",
    type: "rest" as const,
    enabled: true,
    config: { baseUrl: "https://bench.example.com" },
    allowedHosts: ["bench.example.com"],
    capabilities: {
      filterPushdown: false,
      sortPushdown: false,
      joinable: false as const,
      maxPageSize: 100,
      supportsTransactions: false,
      staleness: "real-time" as const,
      ttlSeconds: 0,
    },
    health: "ok" as const,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
  };

  const collection = {
    _id: COLLECTION_ID,
    ...buildWordPressVirtualCollection("posts", CONNECTOR_ID, TENANT),
    tenantId: TENANT,
    enabled: true,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
  };
  collection.source.endpoint = getWordPressRestEndpoint("posts");

  const db = {
    crud: {
      findOne: async (col: string, query: any) => {
        if (col.includes("virtual_schemas") && (query.slug === "wp-articles" || query._id)) {
          return { success: true, data: collection };
        }
        if (col.includes("connectors") && query._id === CONNECTOR_ID) {
          return { success: true, data: connector };
        }
        return { success: true, data: null };
      },
      findMany: async () => ({ success: true, data: [] }),
      insert: async () => ({ success: true }),
    },
  } as any;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    headers: { get: () => "512" },
    json: async () =>
      Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        title: `Post ${i}`,
        slug: `post-${i}`,
        status: "publish",
        content: "x",
        excerpt: "y",
        date: "2026-07-08",
        modified: "2026-07-08",
        author: 1,
        featured_media: 0,
      })),
  })) as any;

  const opts = {
    tenantId: TENANT,
    user: { isAdmin: true, role: "admin" },
    limit: 25,
    bypassCache: true,
  };

  const ITERATIONS = 200;
  const WARMUP = 20;

  const result = await runBenchmark({
    name: "Virtual Read Passthrough (mock REST)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async () => {
      const r = await executeVirtualRead(db, "wp-articles", opts);
      if (!r.data?.length) throw new Error("empty result");
    },
  });

  printTruthTable({
    title: "Virtual Query Federation (Mock REST)",
    results: [{ ...result, layer: "Federation", shortLabel: "Passthrough" }],
  });
  console.log("\n✅ Phase 0 benchmark baseline recorded (mock REST connector).");
  console.log("   Target v1.0: p95 < 50ms LocalCMS + local DB; < 500ms with external REST.\n");

  globalThis.fetch = originalFetch;
}

async function runLivePostgresFederationBenchmark() {
  const { isPostgresFixtureReachable } =
    await import("@plugins/unified-data-hub/server/postgres-fixture");
  const reachable = await isPostgresFixtureReachable();
  if (!reachable) {
    console.log("⏭️ Skipping live Postgres federation benchmark (Docker Postgres unreachable).\n");
    return;
  }

  const cmsDb = getDbType().toUpperCase();
  console.log(`🚀 Virtual Query Federation LIVE Benchmark (CMS ${cmsDb} → external Postgres)...\n`);

  const { ensureFullInitialization, getDb } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const { seedUnifiedDataHub } = await import("@plugins/unified-data-hub/server/hub-test-seed");
  const { executeVirtualRead } =
    await import("@plugins/unified-data-hub/server/virtual-query-engine");

  await seedUnifiedDataHub(db, "default", { rowCount: 100 });

  const opts = {
    tenantId: "default",
    user: { isAdmin: true, role: "admin" },
    limit: 100,
    bypassCache: true,
  };

  const result = await runBenchmark({
    name: "Virtual Read Passthrough (live Postgres)",
    iterations: 50,
    warmupIterations: 10,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async () => {
      const r = await executeVirtualRead(db, "bench-articles", opts);
      if (r.data?.length !== 100) throw new Error(`expected 100 rows, got ${r.data?.length}`);
    },
  });

  printTruthTable({
    title: "Virtual Query Federation (Live Postgres)",
    results: [{ ...result, layer: "Federation", shortLabel: "Postgres 100 rows" }],
  });

  const p95 = result.p95Ms ?? 0;
  if (p95 > 50) {
    console.log(
      `⚠️  Live Postgres p95 ${p95.toFixed(2)}ms exceeds 50ms target (pool-per-query v1.0).\n`,
    );
  } else {
    console.log(`✅ Live Postgres p95 ${p95.toFixed(2)}ms within 50ms target.\n`);
  }
}

async function runLiveWordPressRestFederationBenchmark() {
  console.log(
    `🚀 Virtual Query Federation LIVE Benchmark (CMS ${getDbType().toUpperCase()} → WP REST)...\n`,
  );

  const { ensureFullInitialization, getDb } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const { seedUnifiedDataHub } = await import("@plugins/unified-data-hub/server/hub-test-seed");
  const { executeVirtualRead } =
    await import("@plugins/unified-data-hub/server/virtual-query-engine");

  await seedUnifiedDataHub(db, "default", { fixture: "wordpress", rowCount: 50 });

  const opts = {
    tenantId: "default",
    user: { isAdmin: true, role: "admin" },
    limit: 25,
    bypassCache: true,
  };

  const result = await runBenchmark({
    name: "Virtual Read Passthrough (live WordPress REST)",
    iterations: 50,
    warmupIterations: 10,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async () => {
      const r = await executeVirtualRead(db, "wp-articles", opts);
      if (r.data?.length !== 25) throw new Error(`expected 25 rows, got ${r.data?.length}`);
    },
  });

  printTruthTable({
    title: "Virtual Query Federation (Live WordPress REST)",
    results: [{ ...result, layer: "Federation", shortLabel: "REST 25 rows" }],
  });

  const p95 = result.p95Ms ?? 0;
  console.log(`✅ Live WordPress REST p95 ${p95.toFixed(2)}ms (target < 500ms external REST).\n`);
}

test("Virtual Query Federation Live Postgres Benchmark", async () => {
  await runLivePostgresFederationBenchmark();
}, 180000);

test("Virtual Query Federation Live WordPress REST Benchmark", async () => {
  await runLiveWordPressRestFederationBenchmark();
}, 180000);

test("Virtual Query Federation POC Benchmark", async () => {
  await runVirtualFederationBenchmark();
}, 120000);
