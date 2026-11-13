/**
 * @file src/databases/auth/revocation-publish.server.ts
 * @description Publishes a session revocation to every layer that can outlive
 * the write: the in-process revocation epoch and the shared cache.
 *
 * Features:
 * - In-process epoch for sub-microsecond same-worker invalidation (global, tenant, user)
 * - Distributed markers (`auth:revoke:global`, `auth:revoke:tenant:<id>`,
 *   `auth:revoke:user:<id>`) so other workers reject warm session snapshots
 *   issued before the change
 * - Fail-open only for the marker write (the DB/cache purge is authoritative)
 * - Memoized marker reads: one cache round-trip per scope per 5s window, never per request
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { logger } from "@utils/logger";
import { revokeAllSessions, revokeTenantSessions, revokeUserSessions } from "./revocation-epoch";

/** Must match the reader in `src/hooks/handle-authentication.ts`. */
export const USER_REVOCATION_CACHE_PREFIX = "auth:revoke:user:";
/** Tenant-wide marker, stored inside the revoked tenant's own cache namespace. */
export const TENANT_REVOCATION_CACHE_PREFIX = "auth:revoke:tenant:";
/**
 * System-wide marker. Stored in the default (no-tenant) namespace so a worker
 * serving ANY tenant reads the same key — a global revocation is not per-tenant.
 */
export const GLOBAL_REVOCATION_CACHE_KEY = "auth:revoke:global";
/** Longest possible session lifetime (30 days) — the marker must outlive every session. */
export const REVOCATION_MARKER_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Revocation granularity published to the shared cache. */
export type RevocationScope = "global" | "tenant" | "user";

const DISTRIBUTED_REVOKE_MEMO_MS = 5_000;
/** Mirrors `MAX_TRACKED_REVOCATIONS` in `revocation-epoch.ts`. */
const MAX_DISTRIBUTED_MEMO_ENTRIES = 20_000;

interface DistributedRevocationMemoEntry {
  checkedAt: number;
  epoch: number;
}

/**
 * Distributed reads are memoized per (namespace, key): the session hot path must
 * not pay a cache round-trip per request, only one per scope per window.
 */
const distributedRevocationMemo = new Map<string, DistributedRevocationMemoEntry>();

/**
 * Mark every session issued for `userId` before "now" as revoked.
 * Returns the epoch so callers can log/trace the exact value.
 */
export async function publishUserRevocation(
  userId: string,
  tenantId?: string | null,
): Promise<number> {
  const epoch = revokeUserSessions(userId);
  try {
    await cacheService.set(
      `${USER_REVOCATION_CACHE_PREFIX}${userId}`,
      epoch,
      REVOCATION_MARKER_TTL_SECONDS,
      tenantId ?? undefined,
    );
  } catch (error) {
    // The session rows themselves are deleted by the caller; the marker only
    // extends the guarantee to workers that never saw that delete.
    logger.debug("[revocation] distributed marker unavailable", error);
  }
  return epoch;
}

/**
 * Mark every session in the system as revoked ("log out everywhere").
 * Returns the epoch so callers can log/trace the exact value.
 */
export async function publishGlobalRevocation(): Promise<number> {
  const epoch = revokeAllSessions();
  try {
    await cacheService.set(
      GLOBAL_REVOCATION_CACHE_KEY,
      epoch,
      REVOCATION_MARKER_TTL_SECONDS,
      // No tenant: the marker belongs to the shared default namespace so every
      // worker can read it, whichever tenant the request is scoped to.
      undefined,
    );
  } catch (error) {
    // Same fail-open contract as the user marker: the caller still deletes the
    // session rows, and local workers already honour the in-process epoch.
    logger.debug("[revocation] global marker unavailable", error);
  }
  return epoch;
}

/**
 * Mark every session belonging to `tenantId` as revoked (tenant lockout / plan
 * termination). Returns the epoch so callers can log/trace the exact value.
 */
export async function publishTenantRevocation(tenantId: string): Promise<number> {
  const epoch = revokeTenantSessions(tenantId);
  if (epoch === 0) return 0;
  try {
    await cacheService.set(
      `${TENANT_REVOCATION_CACHE_PREFIX}${tenantId}`,
      epoch,
      REVOCATION_MARKER_TTL_SECONDS,
      tenantId,
    );
  } catch (error) {
    // Fail-open only for the marker: the in-process epoch and the session purge
    // remain authoritative for this worker.
    logger.debug("[revocation] tenant marker unavailable", error);
  }
  return epoch;
}

/**
 * Resolves the cache key (and namespace) of a scope's distributed marker.
 * Returns `null` when the scope needs an id that was not supplied.
 */
function resolveMarker(
  scope: RevocationScope,
  id?: string | null,
  tenantId?: string | null,
): { key: string; tenantId: string | undefined } | null {
  switch (scope) {
    case "global":
      return { key: GLOBAL_REVOCATION_CACHE_KEY, tenantId: undefined };
    case "tenant":
      return id ? { key: `${TENANT_REVOCATION_CACHE_PREFIX}${id}`, tenantId: id } : null;
    case "user":
      return id
        ? { key: `${USER_REVOCATION_CACHE_PREFIX}${id}`, tenantId: tenantId ?? undefined }
        : null;
  }
}

/**
 * Reads the distributed revocation epoch for a scope (`0` when no marker exists).
 *
 * Combine with the in-process check:
 * `isSessionRevoked(issuedAtMs, userId, tenantId) || issuedAtMs < await getDistributedRevocationEpoch(...)`.
 *
 * Cost discipline: one cache read per (namespace, key) per `DISTRIBUTED_REVOKE_MEMO_MS`
 * window. A cache failure is fail-open (returns `0`) — the in-process epoch and the
 * DB session rows still apply.
 */
export async function getDistributedRevocationEpoch(
  scope: RevocationScope,
  id?: string | null,
  tenantId?: string | null,
): Promise<number> {
  const marker = resolveMarker(scope, id, tenantId);
  if (!marker) return 0;

  const memoKey = `${marker.tenantId ?? "default"}|${marker.key}`;
  const now = Date.now();
  const memo = distributedRevocationMemo.get(memoKey);
  if (memo && now - memo.checkedAt < DISTRIBUTED_REVOKE_MEMO_MS) {
    return memo.epoch;
  }

  let epoch = 0;
  try {
    const stored = await cacheService.get<number>(marker.key, marker.tenantId);
    const parsed = typeof stored === "number" ? stored : Number(stored);
    epoch = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (error) {
    // Distributed cache unavailable — the in-process epoch still applies.
    logger.debug("[revocation] distributed marker unreadable", error);
  }

  if (distributedRevocationMemo.size > MAX_DISTRIBUTED_MEMO_ENTRIES) {
    distributedRevocationMemo.clear();
  }
  distributedRevocationMemo.set(memoKey, { checkedAt: now, epoch });
  return epoch;
}
