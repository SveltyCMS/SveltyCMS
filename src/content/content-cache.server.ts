/**
 * @file src/content/content-cache.server.ts
 * @description Content-layer cache helpers aligned with the dual-layer L1/L2 cache system.
 *
 * ### Features:
 * - Prefix-based schema invalidation (`schema:`)
 * - Navigation tree invalidation on structural changes
 * - Tag-based cache entries for O(1) bucket clearing
 * - Centralized content update notifications
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { eventBus, SystemEvents } from "@utils/event-bus";
import type { Schema } from "./types";

export const SCHEMA_CACHE_TTL_S = 3600;
export const NAVIGATION_CACHE_TTL_S = 300;

/** Tags for schema metadata entries in L1/L2. */
export function schemaCacheTags(schema: Schema): string[] {
  const id = String(schema._id || schema.name || "unknown").toLowerCase();
  return ["schema", `schema:${id}`];
}

/** Tags for SSR navigation tree snapshots. */
export function navigationCacheTags(tenantId?: string | null): string[] {
  const tid = tenantId || "global";
  return ["navigation", "navigation:tree", `navigation:tree:${tid}`];
}

/** Writes a schema cache entry to L1 + L2 with SCHEMA category and collection tags. */
export async function setSchemaCacheEntry(
  cacheKey: string,
  value: Record<string, unknown>,
  schema: Schema,
  tenantId: string | null = null,
): Promise<void> {
  await cacheService.set(
    cacheKey,
    value,
    SCHEMA_CACHE_TTL_S,
    tenantId,
    CacheCategory.SCHEMA,
    schemaCacheTags(schema),
  );
}

/** Clears all `schema:*` keys via prefix-bucketed invalidation (L1 + L2). */
export async function invalidateSchemaCache(tenantId: string | null = null): Promise<void> {
  await cacheService.clearByPattern("schema:", tenantId);
}

/** Clears cached navigation trees when the content structure changes. */
export async function invalidateNavigationCache(tenantId: string | null = null): Promise<void> {
  await cacheService.clearByPattern("navigation:tree:", tenantId);
}

/**
 * Invalidates navigation cache and broadcasts `content:update`.
 * Optionally wipes schema prefix before a full rescan.
 */
export async function notifyContentUpdate(
  tenantId?: string | null,
  options?: { invalidateSchema?: boolean; batchSize?: number },
): Promise<void> {
  const tid = tenantId ?? null;

  if (options?.invalidateSchema) {
    await invalidateSchemaCache(tid);
  }

  await invalidateNavigationCache(tid);

  eventBus.broadcast(SystemEvents.CONTENT_UPDATE, {
    version: Date.now(),
    tenantId: tenantId || "all",
    ...(options?.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
  });
}
