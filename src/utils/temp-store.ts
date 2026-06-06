/**
 * @file src/utils/temp-store.ts
 * @description Redis-backed temporary store for large job payloads with native TTL.
 * Replaces file-based disk I/O with in-memory Redis — no filesystem pollution, no cleanup cron.
 */

import { generateUUID } from "@utils/native-utils";
import { logger } from "./logger";

const TTL_SECONDS = 3600; // 1 hour

/** Lazy-load Redis client to avoid init-time dependency issues */
async function getRedis() {
  const { createClient } = await import("redis");
  const client = createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  });
  await client.connect();
  return client;
}

/**
 * Saves a payload and returns its ID. Redis auto-expires after TTL.
 */
export async function saveTempPayload(data: any): Promise<string> {
  try {
    const redis = await getRedis();
    const id = `job-payload:${generateUUID()}`;
    await redis.set(id, JSON.stringify(data), { EX: TTL_SECONDS });
    await redis.quit();
    return id;
  } catch (err) {
    logger.error("[TempStore] Redis save failed, falling back to in-memory:", err);
    // Fallback: return a prefixed ID with the data embedded (for import-jobs to detect)
    const id = `inline:${generateUUID()}`;
    (globalThis as any).__tempPayloads = (globalThis as any).__tempPayloads || new Map();
    (globalThis as any).__tempPayloads.set(id, data);
    return id;
  }
}

/**
 * Retrieves a payload by ID.
 */
export async function getTempPayload(id: string): Promise<any | null> {
  // Inline fallback
  if (id.startsWith("inline:")) {
    const map = (globalThis as any).__tempPayloads;
    if (!map) return null;
    const data = map.get(id);
    map.delete(id);
    return data ?? null;
  }

  try {
    const redis = await getRedis();
    const raw = await redis.get(id);
    await redis.quit();
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.error(`[TempStore] Failed to read payload ${id}:`, err);
    return null;
  }
}

/**
 * Deletes a payload by ID.
 */
export async function deleteTempPayload(id: string): Promise<void> {
  if (id.startsWith("inline:")) {
    (globalThis as any).__tempPayloads?.delete(id);
    return;
  }

  try {
    const redis = await getRedis();
    await redis.del(id);
    await redis.quit();
  } catch {
    // Non-critical — Redis will auto-expire
  }
}

/**
 * No-op: Redis handles TTL natively. Kept for API compatibility.
 */
export async function cleanupTempStore(_ttlMs?: number) {
  // Redis auto-expires keys — no cleanup needed
}
