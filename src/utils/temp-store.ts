/**
 * @file src/utils/temp-store.ts
 * @description Temporary store for job payloads backed by CacheService (L1 LRU + L2 Redis).
 *
 * Centralized on CacheService — eliminates redundant secondary Redis connections,
 * shares pooling, and leverages automatic TTL eviction.
 */

import { generateUUID } from "@utils/native-utils";
import { cacheService } from "@src/databases/cache/cache-service";

const TTL_SECONDS = 3600;

/**
 * Saves a payload and returns its ID. Auto-expires after TTL.
 */
export async function saveTempPayload(data: any): Promise<string> {
  const id = `job-payload:${generateUUID()}`;
  await cacheService.set(id, data, TTL_SECONDS, "global");
  return id;
}

/**
 * Retrieves a payload by ID. Payloads are consumed (one-time read).
 */
export async function getTempPayload(id: string): Promise<any | null> {
  const data = await cacheService.get<any>(id, "global");
  if (data !== undefined && data !== null) {
    await cacheService.delete(id, "global");
    return data;
  }
  return null;
}

/**
 * Deletes a payload by ID.
 */
export async function deleteTempPayload(id: string): Promise<void> {
  await cacheService.delete(id, "global");
}

/**
 * Periodic cleanup stub (CacheService handles LRU and TTL auto-eviction).
 */
export function cleanupTempStore(): void {
  // No-op: CacheService automatically evicts on TTL expiry
}
