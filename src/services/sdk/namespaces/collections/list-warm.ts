/**
 * @file src/services/sdk/namespaces/collections/list-warm.ts
 * @description Prediction-driven default-list cache warming for the write path.
 *
 * After a successful interactive write the actor (typically the admin UI)
 * re-reads the collection's default list — a GET that would otherwise be a
 * cold DB query plus full re-cache. This module closes the loop with the
 * behavioral learner: when the written collection is hot
 * (`getHotCollections`), it re-runs the canonical default list read through
 * the same find() pipeline, so L1 request cache, L2 response cache, keyspace
 * index, cache tags and epochs stay consistent by construction — the warm
 * produces the exact payload and cache-key a real list GET would.
 *
 * ### Features:
 * - Rate-limited: one warm per collection per 5s window — write bursts never
 *   amplify into read amplification (each warm re-queries the list once)
 * - Learner-gated: only collections the behavioral learner scores as hot
 * - System/internal writes skipped (content sync, imports, LocalCMS system)
 * - Fire-and-forget on a microtask; failures are debug-logged, never thrown
 * - Env kill-switch: `SVELTY_DISABLE_LIST_WARM=1`
 */
import { getHotCollections } from "@src/services/intelligence/behavioral-learner";
import { logger } from "@utils/logger";

/** Minimum delay between two warms of the same tenant:collection. */
const LIST_WARM_MIN_INTERVAL_MS = 5_000;
/** Cap on hot collections scanned per warm decision. */
const LIST_WARM_HOT_SCAN = 100;

const warmedAt = new Map<string, number>();

function isDisabled(): boolean {
  const raw = process.env.SVELTY_DISABLE_LIST_WARM;
  return raw === "1" || raw?.toLowerCase() === "true";
}

/** Clear the rate-limit state (unit tests). */
export function resetListWarmState(): void {
  warmedAt.clear();
}

/**
 * Warm the default list of a collection after an interactive write.
 *
 * Guards, in order: kill-switch → schema/user presence → system actor →
 * 5s rate limit → behavioral-learner hot check. Only then is the read
 * scheduled on a microtask, off the response path.
 *
 * @param schemaId - written collection id (used as the list cache key)
 * @param tenantId - scope of the writer (list cache is tenant-scoped)
 * @param user - actor of the write; the warm re-reads with the SAME actor so
 *   the publication filter (and thus the cache key) matches the writer's next
 *   list GET
 * @param runFind - performs the canonical default list read (find with default
 *   limit/filter). Injected by the caller to avoid an import cycle into the
 *   collections namespace.
 */
export function scheduleDefaultListWarm(
  schemaId: string,
  tenantId: unknown,
  user: unknown,
  runFind: (opts: { tenantId: unknown; user: unknown }) => Promise<unknown>,
): void {
  if (isDisabled()) return;
  if (!schemaId || !user) return;
  if ((user as { _id?: string })._id === "system") return;

  const tid = String(tenantId || "global");
  const now = Date.now();
  const key = `${tid}:${schemaId}`;
  if (now - (warmedAt.get(key) ?? 0) < LIST_WARM_MIN_INTERVAL_MS) return;

  const hot = getHotCollections(tid, LIST_WARM_HOT_SCAN);
  let isHot = false;
  for (let i = 0; i < hot.length; i++) {
    if (hot[i].id === schemaId) {
      isHot = true;
      break;
    }
  }
  if (!isHot) return;

  warmedAt.set(key, now);
  queueMicrotask(() => {
    runFind({ tenantId, user }).catch((err: unknown) => {
      logger.debug(
        `[list-warm] default-list warm failed for ${schemaId}: ${
          (err as Error | undefined)?.message ?? String(err)
        }`,
      );
    });
  });
}
