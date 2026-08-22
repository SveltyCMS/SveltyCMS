/**
 * @file tests/benchmarks/local-sdk-vs-direct.test.ts
 * @description SDK (LocalCMS collections namespace) vs direct adapter CRUD comparison.
 * Measures the remaining SDK tax on create/find/update vs raw db.crud calls.
 */

import { test, setupBenchmarkServer, printTruthTable } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { LocalCMS } from "@src/services/sdk";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { toQueryOptions } from "@src/databases/policy";

let stopServer: (() => Promise<void>) | null = null;

async function run() {
  const server = await setupBenchmarkServer();
  stopServer = server.stop;

  await ensureFullInitialization();
  const db = getDb() as any;
  const cms = new LocalCMS(db);
  const T = "global" as DatabaseId;

  // Provision a collection with a single Input field (like benchmark collections)
  await db.collection
    .createModel({
      _id: "SdkVsDirect",
      name: "SdkVsDirect",
      fields: [{ db_fieldName: "title", widget: { Name: "Input" }, type: "string" }],
    })
    .catch(() => {});

  const systemOpts = { system: true, tenantId: T };
  // Typed policy for the detached phase — explicit, documented fast-path opts.
  const detachedWriteOpts = { ...systemOpts, ...toQueryOptions({ sideEffects: "none" }) };
  const doc = () => ({ _id: `sdk-${Math.random().toString(36).slice(2, 10)}`, title: "hello" });
  const tenantOpts = { tenantId: T };

  // Warmup
  for (let i = 0; i < 200; i++) {
    await db.crud.insert("SdkVsDirect", { _id: `warm-${i}`, title: "w", tenantId: T }, tenantOpts);
    const w = await cms.collections
      .create("SdkVsDirect", { _id: `warm-sdk-${i}`, title: "w" }, systemOpts)
      .catch((e) => {
        if (i === 0) console.log("SDK create error:", e?.message || e);
        return null;
      });
    if (w && i === 0) console.log("SDK create first result:", JSON.stringify(w).slice(0, 200));
  }
  const known = "warm-10";

  // ── CREATE comparison ──
  const N = 2000;
  let t0 = performance.now();
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await db.crud.insert("SdkVsDirect", { ...doc(), tenantId: T }, tenantOpts);
    if (r?.success) ok++;
  }
  const directCreateMs = performance.now() - t0;
  const directCreateRps = (ok / directCreateMs) * 1000;

  t0 = performance.now();
  ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await cms.collections.create("SdkVsDirect", doc(), systemOpts).catch(() => null);
    if (r?.success) ok++;
  }
  const sdkCreateMs = performance.now() - t0;
  const sdkCreateRps = (ok / sdkCreateMs) * 1000;

  // ── FIND ONE comparison ──
  t0 = performance.now();
  ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await db.crud.findOne("SdkVsDirect", { _id: known }, tenantOpts);
    if (r?.success) ok++;
  }
  const directFindMs = performance.now() - t0;
  const directFindRps = (ok / directFindMs) * 1000;

  // Profile pieces: getSchema alone, findMany alone
  t0 = performance.now();
  for (let i = 0; i < N; i++) {
    await cms.collections.getSchema("SdkVsDirect", T);
  }
  const schemaMs = performance.now() - t0;

  t0 = performance.now();
  for (let i = 0; i < N; i++) {
    await db.crud.findMany("SdkVsDirect", { _id: known, tenantId: T }, { limit: 50 });
  }
  const findManyMs = performance.now() - t0;
  console.log(
    `   [profile] getSchema: ${((schemaMs / N) * 1000).toFixed(1)}µs · findMany: ${((findManyMs / N) * 1000).toFixed(1)}µs`,
  );

  t0 = performance.now();
  ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await cms.collections
      .find("SdkVsDirect", { tenantId: T, filter: { _id: known }, bypassCache: true })
      .catch(() => null);
    if (r?.success) ok++;
  }
  const sdkFindMs = performance.now() - t0;
  const sdkFindRps = (ok / sdkFindMs) * 1000;

  // ── UPDATE comparison ──
  t0 = performance.now();
  ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await db.crud.update("SdkVsDirect", known, { title: `u${i}` }, tenantOpts);
    if (r?.success) ok++;
  }
  const directUpdateMs = performance.now() - t0;
  const directUpdateRps = (ok / directUpdateMs) * 1000;

  t0 = performance.now();
  ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await cms.collections
      .update("SdkVsDirect", known, { title: `u${i}` }, systemOpts)
      .catch(() => null);
    if (r?.success) ok++;
  }
  const sdkUpdateMs = performance.now() - t0;
  const sdkUpdateRps = (ok / sdkUpdateMs) * 1000;

  // ── DETACHED MODE: explicit WritePolicy sideEffects: "none" (the documented
  // product option for bulk/import callers) — isolates the pure critical path
  // from the post-write side-effect machinery (outbox emit, cache invalidation,
  // workflow init). Benchmarks no longer rely on ambient env flags.
  console.log("\n   ═══ PHASE 2: DETACHED (WritePolicy sideEffects: none) ═══");

  t0 = performance.now();
  ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await cms.collections
      .create("SdkVsDirect", doc(), detachedWriteOpts)
      .catch(() => null);
    if (r?.success) ok++;
  }
  const detachedCreateMs = performance.now() - t0;
  const detachedCreateRps = (ok / detachedCreateMs) * 1000;

  // ── NO-OUTBOX: full pipeline minus outbox flush (isolates the outbox
  // contribution to the write tax — the flush insertMany contends for the
  // SQLite write mutex). DISABLE_OUTBOX is a documented config kill-switch.
  console.log("\n   ═══ PHASE 3: NO-OUTBOX (DISABLE_OUTBOX=true) ═══");
  process.env.DISABLE_OUTBOX = "true";
  await new Promise((r) => setTimeout(r, 300));
  t0 = performance.now();
  ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await cms.collections.create("SdkVsDirect", doc(), systemOpts).catch(() => null);
    if (r?.success) ok++;
  }
  const noOutboxMs = performance.now() - t0;
  const noOutboxRps = (ok / noOutboxMs) * 1000;
  delete process.env.DISABLE_OUTBOX;
  await new Promise((r) => setTimeout(r, 300));

  // ── MICRO-PROFILE: replicate schedulePostWrite's work to find the tax ──
  console.log("\n   ═══ PHASE 4: WRITE-MACHINERY MICRO-PROFILE ═══");
  const { cacheService: cacheSvc } = await import("@src/databases/cache/cache-service");
  const M = 200;
  const profile: string[] = [];

  let pt0 = performance.now();
  for (let i = 0; i < M; i++) {
    await cacheSvc.clearByPattern(`collection:SdkVsDirect:${i}`, T);
  }
  profile.push(`clearByPattern: ${((M / (performance.now() - pt0)) * 1000).toFixed(0)} RPS`);

  pt0 = performance.now();
  for (let i = 0; i < M; i++) {
    const { responseCache } = await import("@src/services/cache/response-cache");
    await responseCache.invalidateAll(T);
  }
  profile.push(
    `responseCache.invalidateAll: ${((M / (performance.now() - pt0)) * 1000).toFixed(0)} RPS`,
  );

  pt0 = performance.now();
  for (let i = 0; i < M; i++) {
    const { workflowService } = await import("@src/services/background/workflow-service");
    await workflowService.initializeWorkflow(`probe-${i}`, "SdkVsDirect", T);
  }
  profile.push(
    `workflow init (import+cached-neg): ${((M / (performance.now() - pt0)) * 1000).toFixed(0)} RPS`,
  );

  pt0 = performance.now();
  for (let i = 0; i < M; i++) {
    const { pubSub } = await import("@src/services/background/pub-sub");
    pubSub.publish("entryUpdated", {
      collection: "SdkVsDirect",
      id: `probe-${i}`,
      action: "probe",
      data: null,
      timestamp: new Date().toISOString(),
    });
  }
  profile.push(`pubSub.publish: ${((M / (performance.now() - pt0)) * 1000).toFixed(0)} RPS`);

  pt0 = performance.now();
  for (let i = 0; i < M; i++) {
    const { outboxService } = await import("@src/services/outbox");
    await outboxService.emit("entry:create", "entry", `probe-${i}`, {}, T);
  }
  profile.push(
    `outbox emit (buffered): ${((M / (performance.now() - pt0)) * 1000).toFixed(0)} RPS`,
  );
  await new Promise((r) => setTimeout(r, 300));

  for (const p of profile) console.log("   [profile] " + p);

  // ── BULK INSERT PROFILE: full vs no-read-back (SQLite) ──
  const BK = 40;
  const bulkDocs = (base: number) =>
    Array.from({ length: 100 }, (_, i) => ({
      _id: `bk-${base}-${i}`,
      title: `row ${base}-${i}`,
      status: "active",
      tenantId: T,
    }));
  for (let r = 0; r < 3; r++) {
    await db.crud.insertMany("SdkVsDirect", bulkDocs(r), tenantOpts);
  }
  let bt0 = performance.now();
  for (let r = 0; r < BK; r++) {
    await db.crud.insertMany("SdkVsDirect", bulkDocs(r), tenantOpts);
  }
  const bulkFullMs = performance.now() - bt0;
  bt0 = performance.now();
  for (let r = 0; r < BK; r++) {
    await db.crud.insertMany("SdkVsDirect", bulkDocs(r), { ...tenantOpts, skipReturning: true });
  }
  const bulkNoRetMs = performance.now() - bt0;
  console.log(
    "   [profile] bulk full:     " +
      ((BK / bulkFullMs) * 1000).toFixed(0) +
      " batches/s (" +
      (bulkFullMs / BK).toFixed(2) +
      "ms)",
  );
  console.log(
    "   [profile] bulk noReturn: " +
      ((BK / bulkNoRetMs) * 1000).toFixed(0) +
      " batches/s (" +
      (bulkNoRetMs / BK).toFixed(2) +
      "ms)",
  );
  console.log(
    "   [profile] read-back tax: " +
      (bulkFullMs / BK - bulkNoRetMs / BK).toFixed(2) +
      "ms per batch",
  );

  t0 = performance.now();
  ok = 0;
  for (let i = 0; i < N; i++) {
    const r = await cms.collections
      .update("SdkVsDirect", known, { title: `u${i}` }, detachedWriteOpts)
      .catch(() => null);
    if (r?.success) ok++;
  }
  const detachedUpdateMs = performance.now() - t0;
  const detachedUpdateRps = (ok / detachedUpdateMs) * 1000;

  printTruthTable({
    title: "SVELTYCMS — SDK VS DIRECT ADAPTER (SQLITE)",
    shortLabel: "SDK-vs-Direct",
    subtitle: "cms.collections.* vs db.crud.* — LocalCMS tax (full side effects, no env flags)",
    results: [
      { name: "Direct insert", avgMs: directCreateMs / N, rps: directCreateRps, layer: "DB" },
      { name: "SDK create", avgMs: sdkCreateMs / N, rps: sdkCreateRps, layer: "SDK" },
      { name: "Direct findOne", avgMs: directFindMs / N, rps: directFindRps, layer: "DB" },
      { name: "SDK find (bypassCache)", avgMs: sdkFindMs / N, rps: sdkFindRps, layer: "SDK" },
      { name: "Direct update", avgMs: directUpdateMs / N, rps: directUpdateRps, layer: "DB" },
      { name: "SDK update", avgMs: sdkUpdateMs / N, rps: sdkUpdateRps, layer: "SDK" },
      {
        name: "SDK create (detached)",
        avgMs: detachedCreateMs / N,
        rps: detachedCreateRps,
        layer: "DETACHED",
      },
      {
        name: "SDK update (detached)",
        avgMs: detachedUpdateMs / N,
        rps: detachedUpdateRps,
        layer: "DETACHED",
      },
    ],
  });

  console.log(`\n📊 SDK tax (full side effects):`);
  console.log(
    `   create: ${((sdkCreateRps / directCreateRps - 1) * 100).toFixed(1)}% (${sdkCreateRps.toFixed(0)} vs ${directCreateRps.toFixed(0)} RPS)`,
  );
  console.log(
    `   find:   ${((sdkFindRps / directFindRps - 1) * 100).toFixed(1)}% (${sdkFindRps.toFixed(0)} vs ${directFindRps.toFixed(0)} RPS)`,
  );
  console.log(
    `   update: ${((sdkUpdateRps / directUpdateRps - 1) * 100).toFixed(1)}% (${sdkUpdateRps.toFixed(0)} vs ${directUpdateRps.toFixed(0)} RPS)`,
  );
  console.log(`\n📊 DETACHED mode (explicit skipSideEffects — documented product option):`);
  console.log(
    `   create: ${detachedCreateRps.toFixed(0)} RPS (full ${sdkCreateRps.toFixed(0)} → detached ${detachedCreateRps.toFixed(0)} = ${((detachedCreateRps / sdkCreateRps - 1) * 100).toFixed(1)}%)`,
  );
  console.log(
    `   update: ${detachedUpdateRps.toFixed(0)} RPS (full ${sdkUpdateRps.toFixed(0)} → detached ${detachedUpdateRps.toFixed(0)} = ${((detachedUpdateRps / sdkUpdateRps - 1) * 100).toFixed(1)}%)`,
  );
  console.log(`\n📊 OUTBOX isolation (DISABLE_OUTBOX=true):`);
  console.log(
    `   create: ${noOutboxRps.toFixed(0)} RPS (outbox ON ${sdkCreateRps.toFixed(0)} → outbox OFF ${noOutboxRps.toFixed(0)} = ${((noOutboxRps / sdkCreateRps - 1) * 100).toFixed(1)}%)`,
  );
}

test("Local SDK vs Direct Adapter CRUD", async () => {
  try {
    await run();
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 600000);
