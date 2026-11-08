/**
 * @file src/services/sdk/namespaces/collections/revisions.ts
 * @description Revision tracking, atomic delta patching, and rollback restoration for CollectionsNamespace.
 *
 * Features:
 * - Pre-write snapshots stored in content_revisions table
 * - Atomic delta extraction to minimize memory overhead and database storage bloat
 * - Reconstructs full snapshots seamlessly across deltas and legacy full snapshots
 * - Zero deepClone overhead during revision preparation
 * - Revision limit bounding with automatic prune threshold (2x limit)
 * - Snapshot extraction supporting both flattened SQL and nested Mongo schemas
 * - Replay restoration protecting immutable and scheduling metadata
 */

import { AppError, raise } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { versionKey } from "@utils/optimistic-lock";
import { DEFAULT_REVISION_LIMIT, MIN_REVISION_LIMIT } from "@src/content/revision-defaults";
import type {
  ContentRevision,
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  IDBAdapter,
  PaginatedResult,
  PaginationOptions,
  BaseQueryOptions,
} from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import type { LocalApiOptions } from "../types";

export interface RevisionContext {
  _dbAdapter: IDBAdapter;
  schemaOf(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema>;
  getCollectionName(schemaId: string): string;
  update(
    collectionId: string,
    entryId: string,
    data: unknown,
    options?: LocalApiOptions,
  ): Promise<unknown>;
  assertEntryOwnership(
    schema: Schema,
    entryId: string,
    tenantId: DatabaseId | null | undefined,
    user: unknown,
    system?: boolean,
  ): void | Promise<void>;
}

/**
 * Compact delta payload format stored in content_revisions.data
 */
export interface RevisionDeltaPayload {
  _delta: true;
  changes: Record<string, unknown>;
  deletedKeys?: string[];
}

/**
 * Checks whether an unknown object matches the compact RevisionDeltaPayload structure.
 */
export function isRevisionDeltaPayload(val: unknown): val is RevisionDeltaPayload {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const candidate = val as Record<string, unknown>;
  return (
    candidate._delta === true && candidate.changes !== null && typeof candidate.changes === "object"
  );
}

/**
 * The Collection Builder accepts 1–1000, so any positive integer is honoured; an
 * absent/non-finite limit falls back to {@link DEFAULT_REVISION_LIMIT}.
 */
export function revisionLimitOf(schema: Schema): number {
  const configured = schema.revisionLimit;
  if (!Number.isFinite(configured) || (configured as number) < MIN_REVISION_LIMIT) {
    return DEFAULT_REVISION_LIMIT;
  }
  return Math.floor(configured as number);
}

/**
 * Values to try in a compare-and-set filter for one row version.
 *
 * A `Date` binds correctly on Drizzle (`timestamp`) and Mongoose; the raw SDK
 * value (an ISO string) is the fallback for adapters that store strings. Both
 * represent the version the caller loaded, so a retry cannot mask a real change.
 */
export function casVersionCandidates(version: unknown): unknown[] {
  const candidates: unknown[] = [];
  const ms = versionKey(version);
  if (ms !== null) candidates.push(new Date(ms));
  candidates.push(version);
  return candidates;
}

/** Revision-row columns that are storage metadata, never part of the snapshot. */
const REVISION_META_KEYS = new Set([
  "_id",
  "contentId",
  "version",
  "commitMessage",
  "authorId",
  "tenantId",
  "createdAt",
  "updatedAt",
]);

/**
 * Deep equality check for primitives, dates, arrays and plain objects without circular reference leaks.
 */
function isFastDeepEqual(a: unknown, b: unknown, visited = new WeakSet<object>()): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object" && typeof b === "object") {
    if (visited.has(a as object)) return true;
    visited.add(a as object);

    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!isFastDeepEqual(a[i], b[i], visited)) return false;
      }
      return true;
    }

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    let countA = 0;
    for (const key in objA) {
      if (Object.hasOwn(objA, key)) {
        countA++;
        if (!Object.hasOwn(objB, key) || !isFastDeepEqual(objA[key], objB[key], visited)) {
          return false;
        }
      }
    }
    let countB = 0;
    for (const key in objB) {
      if (Object.hasOwn(objB, key)) {
        countB++;
        if (countB > countA) return false;
      }
    }
    return countA === countB;
  }

  return false;
}

/**
 * Computes an atomic delta between baseline and current data.
 * Returns null if no changes or if baseline is missing.
 */
export function computeAtomicDelta(
  baseline: Record<string, unknown>,
  current: Record<string, unknown>,
): RevisionDeltaPayload {
  const changes: Record<string, unknown> = {};
  const deletedKeys: string[] = [];

  for (const [key, val] of Object.entries(current)) {
    if (REVISION_META_KEYS.has(key)) continue;
    if (!Object.hasOwn(baseline, key)) {
      changes[key] = val;
    } else if (!isFastDeepEqual(val, baseline[key])) {
      changes[key] = val;
    }
  }

  for (const key of Object.keys(baseline)) {
    if (REVISION_META_KEYS.has(key)) continue;
    if (!Object.hasOwn(current, key)) {
      deletedKeys.push(key);
    }
  }

  const payload: RevisionDeltaPayload = {
    _delta: true,
    changes,
  };
  if (deletedKeys.length > 0) {
    payload.deletedKeys = deletedKeys;
  }
  return payload;
}

/**
 * Applies a revision delta onto a base snapshot.
 */
export function applyRevisionDelta(
  base: Record<string, unknown>,
  delta: RevisionDeltaPayload,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, val] of Object.entries(delta.changes)) {
    result[key] = val;
  }
  if (delta.deletedKeys) {
    for (const key of delta.deletedKeys) {
      delete result[key];
    }
  }
  return result;
}

/**
 * Extract the content snapshot or delta payload from a revision row.
 *
 * SQL adapters flatten the JSON `data` blob into the row root and drop the blob
 * (`flattenDataColumn`), so the snapshot IS the row minus its metadata. Mongo
 * returns the raw `{ data: {...} }` document. Both shapes are accepted.
 */
export function rawRevisionData(row: Record<string, unknown>): Record<string, unknown> | null {
  const blob = row.data;
  if (blob && typeof blob === "object" && !Array.isArray(blob)) {
    return { ...(blob as Record<string, unknown>) };
  }
  if (typeof blob === "string") {
    try {
      const parsed = JSON.parse(blob) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      /* fall through to the flattened shape */
    }
  }

  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!REVISION_META_KEYS.has(key)) snapshot[key] = value;
  }
  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

/**
 * Extract the content snapshot from a revision row.
 * Reconstructs delta payloads if a base snapshot or reconstruction chain is provided.
 * Maintaining 100% backward compatibility for existing full snapshots.
 */
export function revisionSnapshot(
  row: Record<string, unknown>,
  baseSnapshot?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const raw = rawRevisionData(row);
  if (!raw) return null;

  if (isRevisionDeltaPayload(raw)) {
    if (!baseSnapshot) {
      return { ...raw.changes };
    }
    return applyRevisionDelta(baseSnapshot, raw);
  }

  return raw;
}

/**
 * Reconstructs a full snapshot for a target revision version from historical records.
 * Traverses history to locate the baseline snapshot and chains deltas forward.
 */
export async function reconstructRevisionSnapshot(
  revisionsStore: TransactionalRevisionStore,
  contentId: DatabaseId,
  targetVersion: number,
  options?: BaseQueryOptions,
): Promise<Record<string, unknown> | null> {
  const targetResult = await revisionsStore.get(contentId, targetVersion, options);
  if (!targetResult.success || !targetResult.data) return null;

  const targetRow = targetResult.data as unknown as Record<string, unknown>;
  const rawTarget = rawRevisionData(targetRow);
  if (!rawTarget) return null;

  if (!isRevisionDeltaPayload(rawTarget)) {
    return rawTarget;
  }

  // Delta payload: fetch history to locate nearest baseline and accumulate deltas
  const historyResult = await revisionsStore.getHistory(contentId, {
    page: 1,
    pageSize: 100,
    ...options,
  });
  if (!historyResult.success) return rawTarget.changes;

  // History is newest-first (descending version)
  const items = historyResult.data.items as unknown as Record<string, unknown>[];
  const sortedAsc = [...items]
    .map((item) => ({
      version: Number(item.version) || 0,
      raw: rawRevisionData(item),
    }))
    .filter((entry) => entry.version > 0 && entry.version <= targetVersion && entry.raw !== null)
    .sort((a, b) => a.version - b.version);

  let reconstructed: Record<string, unknown> | null = null;
  for (const entry of sortedAsc) {
    if (!entry.raw) continue;
    if (isRevisionDeltaPayload(entry.raw)) {
      if (!reconstructed) {
        reconstructed = { ...entry.raw.changes };
      } else {
        reconstructed = applyRevisionDelta(reconstructed, entry.raw);
      }
    } else {
      reconstructed = { ...entry.raw };
    }
  }

  return reconstructed ?? rawTarget.changes;
}

/**
 * Options threaded by transactional callers only. Omitted everywhere else, so
 * the standalone revision path keeps its best-effort semantics.
 */
export interface RecordRevisionOptions {
  /** Adapter transaction handle — the snapshot joins the caller's transaction. */
  transaction?: unknown;
  /**
   * Rethrow a failed snapshot write instead of swallowing it. Required inside a
   * transaction: committing without the revision would break the promotion
   * contract, so the failure must roll the live write back.
   */
  strict?: boolean;
}

/**
 * Widened view of the content adapter's revision namespace.
 *
 * `IContentAdapter` declares `create`/`getHistory`/`cleanup` without an options
 * bag, but the SQL implementation accepts one and routes it through
 * `crud.insert`/`getDb` — the only way to put the snapshot on the promotion's
 * transaction connection without editing the shared adapter interface.
 */
interface TransactionalRevisionStore {
  create(
    revision: EntityCreate<ContentRevision>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ContentRevision>>;
  get(
    contentId: DatabaseId,
    version: number,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ContentRevision | null>>;
  getHistory(
    contentId: DatabaseId,
    options?: PaginationOptions & BaseQueryOptions,
  ): Promise<DatabaseResult<PaginatedResult<ContentRevision>>>;
  cleanup(
    contentId: DatabaseId,
    keepLatest: number,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>>;
}

/**
 * Persist a revision snapshot for a revision-enabled collection update.
 * Awaited after the primary write so request teardown cannot drop it;
 * failures are logged and do not fail the content write — unless the caller is
 * inside a transaction (`strict`), where they must abort it.
 * The version is derived from the latest existing revision (+1).
 *
 * Employs atomic delta extraction against previous historical snapshot to
 * avoid deep-cloning full object duplicates and reduce database bloat.
 */
export async function recordRevision(
  dbAdapter: IDBAdapter,
  entryId: string,
  previousData: unknown,
  user: unknown,
  tenantId: DatabaseId | null | undefined,
  revisionLimit: number = DEFAULT_REVISION_LIMIT,
  options?: RecordRevisionOptions,
): Promise<void> {
  try {
    const revisions = dbAdapter.content.revisions as unknown as TransactionalRevisionStore;
    const txOptions = options?.transaction ? { transaction: options.transaction } : undefined;

    const history = await revisions.getHistory(entryId as DatabaseId, {
      page: 1,
      pageSize: 1,
      ...txOptions,
    });
    const items = history.success ? history.data.items : [];
    const total = history.success ? Number(history.data.total) || 0 : 0;
    const newestVersion = items.length > 0 ? Number(items[0].version) || 0 : 0;
    const nextVersion = newestVersion > 0 ? newestVersion + 1 : total + 1;

    let payloadToStore = previousData;
    if (
      items.length > 0 &&
      previousData &&
      typeof previousData === "object" &&
      !Array.isArray(previousData)
    ) {
      const latestItem = items[0] as unknown as Record<string, unknown>;
      const latestSnapshot = revisionSnapshot(latestItem);
      if (latestSnapshot && typeof latestSnapshot === "object") {
        const delta = computeAtomicDelta(latestSnapshot, previousData as Record<string, unknown>);
        payloadToStore = delta;
      }
    }

    const created = await revisions.create(
      {
        contentId: entryId as DatabaseId,
        authorId: ((user as { _id?: unknown })?._id || "system") as DatabaseId,
        data: payloadToStore as never,
        version: nextVersion,
        tenantId: tenantId ?? undefined,
      },
      txOptions ? { tenantId: tenantId ?? undefined, ...txOptions } : undefined,
    );
    if (!created.success) {
      raise(
        500,
        created.message || `Failed to record revision for ${entryId}.`,
        "REVISION_WRITE_FAILED",
      );
    }

    if (nextVersion >= revisionLimit * 2 || total + 1 > revisionLimit * 2) {
      await revisions.cleanup(entryId as DatabaseId, revisionLimit, txOptions);
    }
  } catch (err) {
    // Inside a transaction the caller owns the failure: swallowing it would
    // commit a live write whose revision never landed.
    if (options?.strict) throw err;
    logger.debug(
      `[Revisions] Failed to record revision for ${entryId}: ${(err as Error)?.message ?? err}`,
    );
  }
}

/**
 * Restore an entry to a historical revision version.
 */
export async function restoreEntryRevision(
  ctx: RevisionContext,
  collectionId: string,
  entryId: string,
  version: number,
  options: LocalApiOptions = {},
): Promise<{ success: boolean; data?: unknown; [k: string]: unknown }> {
  const { user, tenantId, system } = options;
  if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  if (!Number.isInteger(version) || version < 1) {
    raise(400, "A positive revision version is required.", "BAD_REQUEST");
  }

  const schema = await ctx.schemaOf(collectionId, tenantId);
  if (schema.revision !== true) {
    raise(400, `Collection '${collectionId}' does not track revisions.`, "REVISIONS_DISABLED");
  }
  if (!system) {
    const own = ctx.assertEntryOwnership(schema, entryId, tenantId, user, system);
    if (own) await own;
  }

  const revisionsStore = ctx._dbAdapter.content.revisions as unknown as TransactionalRevisionStore;
  const snapshot = await reconstructRevisionSnapshot(
    revisionsStore,
    entryId as DatabaseId,
    version,
    tenantId ? { tenantId: tenantId as DatabaseId } : undefined,
  );
  if (!snapshot) {
    // Distinguish 404 from invalid snapshot
    const rawCheck = await revisionsStore.get(entryId as DatabaseId, version, {
      tenantId: tenantId as DatabaseId,
    });
    if (!rawCheck.success) {
      raise(500, rawCheck.message || "Failed to read the revision.", "REVISION_READ_FAILED");
    }
    if (!rawCheck.data) {
      raise(404, `Revision ${version} of entry ${entryId} was not found.`, "NOT_FOUND");
    }
    raise(422, `Revision ${version} does not contain a restorable snapshot.`, "INVALID_REVISION");
  }

  const restoreData: Record<string, unknown> = { ...snapshot };
  for (const key of [
    "_id",
    "createdAt",
    "updatedAt",
    "tenantId",
    "isDeleted",
    "deletedAt",
    "_scheduled",
    "status",
  ]) {
    delete restoreData[key];
  }

  return ctx.update(collectionId, entryId, restoreData, options) as Promise<{
    success: boolean;
    data?: unknown;
    [k: string]: unknown;
  }>;
}
