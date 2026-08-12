/**
 * @file src/databases/auth/api-key-usage-accumulator.ts
 * @description
 * Batched API-key usage statistics accumulator (fire-and-forget usage tracking).
 *
 * Previously every authenticated API-key request issued a direct database write
 * (findOneAndUpdate / UPDATE ... SET lastUsedAt, usageCount+1) to record usage
 * statistics — the single largest auth-layer cost for machine traffic. This
 * module aggregates usage records in memory and flushes them in one write per
 * key per interval.
 *
 * ### Features:
 * - O(1) in-memory aggregation keyed by `${tenantId}|${keyId}`
 * - 10s flush interval; the timer is `.unref()`'d so it never keeps the process alive
 * - single aggregated write per key (total count + latest ip/timestamp)
 * - best-effort by design: flush failures are logged and dropped, never surfaced
 * - `flushNow()` for tests and graceful shutdown flushing (shutdown not wired here)
 * - `resetApiKeyUsageAccumulator()` for tests
 */

import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { logger } from "@src/utils/logger";

/** How often accumulated usage records are flushed to the database. */
export const API_KEY_USAGE_FLUSH_INTERVAL_MS = 10_000;

interface ApiKeyUsageEntry {
  /** Number of authenticated requests aggregated for this key. */
  count: number;
  /** Most recent client IP (platform address only — never raw X-Forwarded-For). */
  ip: string;
  /** Timestamp (ms) of the most recent request. */
  ts: number;
  /** Undefined and null are distinct: adapters filter differently (no filter vs isNull). */
  tenantId: string | null | undefined;
}

/**
 * Composite key so the same key id in different tenants never collides
 * (relational adapters can reuse ids across tenants).
 */
function usageKey(keyId: string, tenantId: string | null | undefined): string {
  return `${tenantId === undefined ? "?" : tenantId === null ? "null" : tenantId}|${keyId}`;
}

let pendingUsage = new Map<string, ApiKeyUsageEntry>();
let flushInFlight: Promise<void> | null = null;

/**
 * Records a single authenticated API-key request in memory (O(1), no I/O).
 * Never throws — the database write happens asynchronously on flush.
 */
export function recordApiKeyUsage(
  keyId: string,
  ip: string,
  tenantId: string | null | undefined,
): void {
  const compositeKey = usageKey(keyId, tenantId);
  const existing = pendingUsage.get(compositeKey);
  if (existing) {
    existing.count += 1;
    existing.ip = ip; // latest wins
    existing.ts = Date.now();
  } else {
    pendingUsage.set(compositeKey, { count: 1, ip, ts: Date.now(), tenantId });
  }
}

/**
 * Flushes all pending usage records with a single aggregated write per key.
 * Concurrent calls share the same in-flight flush. Failures are logged and the
 * affected records are dropped — usage statistics are best-effort by design and
 * a failure must never fail or slow down a request.
 */
export function flushNow(): Promise<void> {
  if (!flushInFlight) {
    flushInFlight = drainPendingUsage().finally(() => {
      flushInFlight = null;
    });
  }
  return flushInFlight;
}

async function drainPendingUsage(): Promise<void> {
  if (pendingUsage.size === 0) return;
  // Swap first: usage recorded while the flush runs lands in the next batch.
  const batch = pendingUsage;
  pendingUsage = new Map<string, ApiKeyUsageEntry>();

  await Promise.all(
    [...batch.entries()].map(async ([compositeKey, entry]) => {
      const keyId = compositeKey.slice(compositeKey.indexOf("|") + 1);
      try {
        const result = await dbAdapter.auth.updateApiKeyUsage(
          keyId as DatabaseId,
          entry.ip,
          {
            tenantId: entry.tenantId as DatabaseId | null | undefined,
          },
          {
            usageCount: entry.count,
            lastUsedAt: new Date(entry.ts),
          },
        );
        if (!result.success) {
          logger.debug(
            `[ApiKeyUsage] Flush failed for key ${keyId}: ${result.message ?? "unknown"}`,
          );
        }
      } catch (err) {
        // Adapter failures (DB blip, connection loss) must never surface to requests.
        logger.debug(
          `[ApiKeyUsage] Flush error for key ${keyId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }),
  );
}

/** Clears pending usage records without flushing (tests). */
export function resetApiKeyUsageAccumulator(): void {
  pendingUsage.clear();
}

const flushTimer = setInterval(() => {
  void flushNow();
}, API_KEY_USAGE_FLUSH_INTERVAL_MS);
// Do not keep the process alive purely for usage flushing (Node/worker runtimes).
void flushTimer.unref?.();
