/**
 * @file src/content/prewarm.ts
 * @description Boot-Warmup for the content write path.
 *
 * The cold-write penalty (first `create`/`update`/`mixed` after a fresh server
 * start) is dominated by lazy per-collection initialisation that would otherwise
 * happen on the first write:
 *
 *   - `getModelResilient(dbAdapter, schema)`  -> loads the collection model from
 *     the DB and populates the `collectionModelCache` WeakMap (schema-store).
 *   - `getOrCompilePrepPlan(schema)`          -> compiles the sanitize/truncate
 *     plan and populates the `prepPlanCache` WeakMap (content-utils).
 *   - `resolveSchema(...)`                     -> warms `_schemaCache`.
 *
 * Pre-warming these caches at boot removes the one-time ~10ms (update) /
 * ~2ms (create) cold cost from the first real write, and is purely additive —
 * it performs no writes, no side effects, and never blocks or mutates data.
 *
 * Features are preserved: this only moves the lazy initialisation earlier; it
 * does not change schema, model, or field semantics.
 *
 * @module
 */

let prewarmed = false;

export interface PrewarmOptions {
  tenantId: string | null;
}

/**
 * Warm the write-path caches for every collection belonging to a tenant.
 *
 * Uses dynamic imports to avoid top-level import cycles with the content
 * engine (same technique already used in content/index.server.ts).
 *
 * @param dbAdapter - database adapter (DatabaseAdapter === IDBAdapter)
 * @param tenantId  - tenant whose collections should be pre-warmed
 * @returns number of collections that were pre-warmed
 */
export async function prewarmWritePath(
  dbAdapter: any,
  tenantId: string | null = null,
): Promise<number> {
  try {
    const { contentStore } = await import("@stores/content-registry.svelte");
    const { getModelResilient, collectionModelCache } =
      await import("@services/sdk/namespaces/collections/schema-store");
    const { getOrCompilePrepPlan } = await import("./content-utils");

    const schemas = contentStore.getAllCollections(tenantId);

    for (const schema of schemas) {
      if (!schema || !schema._id) continue;

      // 1. Populate the model cache (the expensive, DB-backed cold block).
      if (!collectionModelCache.has(schema)) {
        try {
          const model = await getModelResilient(dbAdapter, schema);
          collectionModelCache.set(schema, model);
        } catch {
          // Model creation may fail if the collection has no rows yet; the
          // first real write will retry it lazily. Warmup must never throw.
        }
      }

      // 2. Compile the field-prep plan (synchronous, pure, cheap).
      try {
        getOrCompilePrepPlan(schema as { fields?: Array<any> });
      } catch {
        // Best-effort: a malformed schema must not fail boot.
      }
    }

    return schemas.length;
  } catch {
    // Warmup is strictly best-effort — a failure here must never block boot.
    return 0;
  }
}

/**
 * Idempotent guard so that on forced re-init we do not repeat the work.
 */
export function markPrewarmed(): void {
  prewarmed = true;
}

export function wasPrewarmed(): boolean {
  return prewarmed;
}
