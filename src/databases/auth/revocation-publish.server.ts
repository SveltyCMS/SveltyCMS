/**
 * @file src/databases/auth/revocation-publish.server.ts
 * @description Publishes a user-level session revocation to every layer that can
 * outlive the write: the in-process revocation epoch and the shared cache.
 *
 * Features:
 * - In-process epoch for sub-microsecond same-worker invalidation
 * - Distributed marker (`auth:revoke:user:<id>`) so other workers reject warm
 *   session snapshots issued before the change
 * - Fail-open only for the marker write (the DB/cache purge is authoritative)
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { logger } from "@utils/logger";
import { revokeUserSessions } from "./revocation-epoch";

/** Must match the reader in `src/hooks/handle-authentication.ts`. */
export const USER_REVOCATION_CACHE_PREFIX = "auth:revoke:user:";
/** Longest possible session lifetime (30 days) — the marker must outlive every session. */
const REVOCATION_MARKER_TTL_SECONDS = 30 * 24 * 60 * 60;

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
