/**
 * @file src/services/sdk/namespaces/collections/revisions.ts
 * @description Revision tracking and rollback restoration for CollectionsNamespace.
 *
 * Features:
 * - Pre-write snapshots stored in content_revisions table
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
 * Extract the content snapshot from a revision row.
 *
 * SQL adapters flatten the JSON `data` blob into the row root and drop the blob
 * (`flattenDataColumn`), so the snapshot IS the row minus its metadata. Mongo
 * returns the raw `{ data: {...} }` document. Both shapes are accepted.
 */
export function revisionSnapshot(row: Record<string, unknown>): Record<string, unknown> | null {
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

    const created = await revisions.create(
      {
        contentId: entryId as DatabaseId,
        authorId: ((user as { _id?: unknown })?._id || "system") as DatabaseId,
        data: previousData as never,
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

  const revision = await ctx._dbAdapter.content.revisions.get(entryId as DatabaseId, version, {
    tenantId: tenantId as DatabaseId,
  });
  if (!revision.success) {
    raise(500, revision.message || "Failed to read the revision.", "REVISION_READ_FAILED");
  }
  if (!revision.data) {
    raise(404, `Revision ${version} of entry ${entryId} was not found.`, "NOT_FOUND");
  }

  const row = revision.data as unknown as Record<string, unknown>;
  const snapshot = revisionSnapshot(row);
  if (!snapshot) {
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
