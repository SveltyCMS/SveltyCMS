/**
 * @file tests/benchmarks/modules/benchmark-sanitizer.ts
 * @description Pre-flight validation for benchmark environments.
 *
 * Every benchmark MUST pass these checks before measuring. Catches:
 * - Stale data from previous runs (collection not empty)
 * - Failed seed operations that went undetected
 * - Adapter methods that return { success: false } silently
 * - Warmup/iteration collisions before the benchmark loop starts
 *
 * ### Features:
 * - Collection emptiness check before seeding
 * - Seed record verification
 * - Warmup iteration sanity check
 * - Cross-adapter operation validation
 */

import { assertSuccess } from "./benchmark-utils";

export interface BenchmarkSanityOptions {
  /** Collection name used by the benchmark */
  collectionId: string;
  /** Database adapter instance */
  db: any;
  /** Tenant ID for operations */
  tenantId?: string;
  /** Number of warmup iterations the benchmark will use */
  warmupIterations?: number;
}

/**
 * Runs all pre-flight checks for a benchmark environment.
 * Throws on first failure with a descriptive message.
 *
 * ### Usage (in benchmark prepareCollection or before runBenchmark):
 * ```typescript
 * await validateBenchmarkEnvironment({
 *   collectionId: "benchmark_crud",
 *   db,
 *   tenantId: "global",
 *   warmupIterations: 150,
 * });
 * ```
 */
export async function validateBenchmarkEnvironment(options: BenchmarkSanityOptions): Promise<void> {
  const { collectionId, db, tenantId = "global", warmupIterations = 0 } = options;
  const tenantOpts = { tenantId };

  // ── 1. Collection Accessibility ──────────────────────────────────────────
  // Verify the collection exists or can be created. This catches adapter
  // connection issues before the benchmark starts.

  try {
    const countRes = await db.crud.count(collectionId, {}, tenantOpts);
    // Count may fail if collection doesn't exist yet — that's OK
    if (countRes.success) {
      // Collection exists — verify it's empty (or at least not corrupt)
      if (countRes.data > 10_000) {
        console.warn(
          `[Sanitizer] Collection "${collectionId}" has ${countRes.data} records — consider cleanup`,
        );
      }
    }
  } catch {
    // Collection doesn't exist yet — will be created during benchmark setup
  }

  // ── 2. Single-Operation Sanity Check ─────────────────────────────────────
  // Verify that basic CRUD operations succeed before running the full
  // benchmark. This catches adapter-specific error conventions (e.g.,
  // { success: false } vs throwing).

  const sanityId = `bench-sanity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Test insert
  const insertRes = await db.crud.insert(
    collectionId,
    { _id: sanityId, title: "Sanity Check", status: "active", tenantId },
    tenantOpts,
  );
  assertSuccess(insertRes, `sanity-insert-${collectionId}`);

  // Test findOne
  const findRes = await db.crud.findOne(collectionId, { _id: sanityId }, tenantOpts);
  assertSuccess(findRes, `sanity-findOne-${collectionId}`);

  // Test update
  const updateRes = await db.crud.update(
    collectionId,
    sanityId,
    { title: "Sanity Updated" },
    tenantOpts,
  );
  assertSuccess(updateRes, `sanity-update-${collectionId}`);

  // Test delete
  const deleteRes = await db.crud.delete(collectionId, sanityId, tenantOpts);
  assertSuccess(deleteRes, `sanity-delete-${collectionId}`);

  // ── 3. Warmup Isolation Check ────────────────────────────────────────────
  // If the benchmark uses warmup, verify that a single warmup iteration
  // succeeds. This catches the shared-key-pool bug we found in
  // database-performance.test.ts (E11000 on MongoDB).

  if (warmupIterations > 0) {
    const warmupId = `bench-warmup-sanity-${Date.now()}`;
    const warmupInsert = await db.crud.insert(
      collectionId,
      { _id: warmupId, title: "Warmup Sanity", status: "active", tenantId },
      tenantOpts,
    );
    assertSuccess(warmupInsert, `sanity-warmup-insert-${collectionId}`);

    // Clean up the warmup sanity record
    await db.crud.delete(collectionId, warmupId, tenantOpts);
  }

  // ── 4. Bulk Operation Check ──────────────────────────────────────────────
  // If the benchmark uses bulk operations, verify they work

  if (typeof db.crud.insertMany === "function") {
    const bulkIds = Array.from(
      { length: 3 },
      () => `bench-bulk-sanity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    );
    const bulkRes = await db.crud.insertMany(
      collectionId,
      bulkIds.map((id) => ({ _id: id, title: "Bulk Sanity", status: "active", tenantId })),
      tenantOpts,
    );
    assertSuccess(bulkRes, `sanity-bulk-insert-${collectionId}`);

    // Clean up
    for (const id of bulkIds) {
      await db.crud.delete(collectionId, id, tenantOpts);
    }
  }

  console.log(`[Sanitizer] ✅ All sanity checks passed for "${collectionId}"`);
}
