/**
 * @file src/utils/bulk-write-outcome.ts
 * @description Honest reporting for a bulk write.
 *
 * `setEntriesStatus` toasted "N entries published successfully" on any 2xx. A
 * bulk write that matched zero rows (stale id, deleted row, another tenant's
 * row) therefore reported success while the list kept showing DRAFT and the
 * counts never moved. The verdict is decided from the row count the server
 * reports (`modifiedCount` / the returned row array), never from the HTTP
 * status.
 *
 * ### Features:
 * - readAffectedCount: reads the count out of either adapter envelope shape
 * - describeBulkWriteOutcome: success / partial / none, plus the missing count
 */

export type BulkWriteLevel = "success" | "partial" | "none";

export interface BulkWriteOutcome {
  /** Number of rows the server reports as written. */
  affected: number;
  level: BulkWriteLevel;
  /** Requested rows that the server did not confirm (requested - affected). */
  missing: number;
  requested: number;
}

const COUNT_KEYS = ["modifiedCount", "updatedCount", "affectedCount", "count"] as const;

/**
 * Number of rows a bulk write touched, or `undefined` when the response carries
 * no count (then the caller must not invent one).
 *
 * Accepts both shapes the lanes return: `{ success, data: { modifiedCount } }`
 * (the `updateMany` path) and `{ success, data: rows[] }` (the per-row
 * `batch.bulkUpdate` path).
 */
export function readAffectedCount(result: unknown): number | undefined {
  if (Array.isArray(result)) return result.length;
  if (!result || typeof result !== "object") return undefined;

  const inner = (result as { data?: unknown }).data;
  if (Array.isArray(inner)) return inner.length;
  if (inner && typeof inner === "object") {
    for (const key of COUNT_KEYS) {
      const value = (inner as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return undefined;
  }

  for (const key of COUNT_KEYS) {
    const value = (result as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * Verdict for a bulk write, or `null` when the response reports no count (the
 * caller keeps its previous behaviour rather than guessing).
 */
export function describeBulkWriteOutcome(
  requestedIds: readonly string[],
  result: unknown,
): BulkWriteOutcome | null {
  const requested = requestedIds.length;
  const affected = readAffectedCount(result);
  if (affected === undefined || requested === 0) return null;

  // A server that reports more rows than we asked for is counted as complete,
  // never as a partial: only "fewer than requested" is a real shortfall.
  const missing = Math.max(0, requested - affected);
  const level: BulkWriteLevel = missing === 0 ? "success" : affected === 0 ? "none" : "partial";
  return { affected: Math.min(affected, requested), level, missing, requested };
}
