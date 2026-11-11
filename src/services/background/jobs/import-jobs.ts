/**
 * @file src/services/background/jobs/import-jobs.ts
 * @description Background job handler and shared bulk importer for collection documents.
 *
 * Features:
 * - findByIds + insertMany / upsertMany (no per-document findOne)
 * - replace mode: one deleteMany then insertMany
 * - skip mode: one findByIds then insertMany of missing rows
 * - overwrite mode: insertMany (no _id) + upsertMany (has _id)
 * - 🚪 publication gate: every publish transition is re-checked against the
 *   review workflow before any write (and before replace-mode's deleteMany),
 *   because a job can be replayed after the workflow changed
 * - content-package lane: applies a plan's pre-resolved `operations` by
 *   collection through the same bulk importer and the same gate; a plan created
 *   with `duplicateStrategy: "fail"` marks duplicates `conflict`, so a conflict
 *   aborts the job permanently instead of being counted as a skip
 * - backup lane: the backup service queues its `create`/`restore` jobs here;
 *   a restore runs the same publication gate before the first collection is
 *   cleared
 */

import { dbAdapter, getDb } from "@src/databases/db";
import { logger } from "@utils/logger";
import type { JobHandler } from "./job-queue-service";
import { getTempPayload, deleteTempPayload } from "@utils/temp-store";
import type { DatabaseId, IDBAdapter, Job } from "@src/databases/db-interface";
import type { User } from "@src/databases/auth/types";
import { workflowKnownAbsent } from "@src/services/background/workflow-presence";
import { isPublishTransition } from "@src/services/sdk/namespaces/collections/bulk-validation";
import type { BackupManifest } from "@src/services/core/backup-service";

export type BulkImportMode = "merge" | "replace";
export type BulkImportDuplicateStrategy = "skip" | "overwrite";

export interface BulkImportParams {
  collectionName: string;
  data: Record<string, unknown>[];
  mode?: BulkImportMode;
  duplicateStrategy?: BulkImportDuplicateStrategy;
  tenantId?: string;
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
}

/** One pre-resolved content-package operation (structural subset of `ImportOperation`). */
export interface ImportJobOperation {
  collection: string;
  entry: Record<string, unknown>;
  action: "create" | "update" | "skip" | "conflict";
  existingId?: string;
  /** Why the plan decided this action — the conflict reason on a `"fail"` plan. */
  reason?: string;
}

/**
 * Payload accepted by the `import-data` job, for both import lanes.
 *
 * Declared as a type alias (not an interface): `jobQueue.dispatch` takes a
 * `Record<string, unknown>`, and only object *type aliases* carry the implicit
 * index signature that keeps a queued payload assignable to it.
 */
export type ImportJobPayload = {
  /** Direct-import lane: exactly one collection. */
  collectionName?: string;
  /** Direct-import lane: inline rows, or fetched from the temp store. */
  data?: Record<string, unknown>[];
  tempPayloadId?: string;
  mode?: BulkImportMode;
  duplicateStrategy?: BulkImportDuplicateStrategy;
  /** Content-package lane: the plan's pre-resolved operations (multi-collection). */
  operations?: ImportJobOperation[];
  /** Content-package plan this job applies (logging only). */
  planId?: string;
  tenantId?: string;
  /** Actor the publication gate authorizes; a job carries no session of its own. */
  userId?: string;
};

/**
 * Payload of a background backup task (see `runBackupTask`). Declared here as
 * type aliases so they stay assignable to `jobQueue.dispatch`'s record payload.
 */
export type BackupCreateJobPayload = {
  backupTask: "create";
  tenantId: string;
  /** Audit identity of the operator who requested the backup. */
  userId?: string;
  includesMedia: boolean;
  encryptionKey?: string;
  storageDir?: string;
  label: string;
};

/** Payload of a background restore queued by the backup service. */
export type BackupRestoreJobPayload = {
  backupTask: "restore";
  backupPath: string;
  targetTenant: string;
  /** Actor the publication gate authorizes; a queued restore carries no session. */
  userId?: string;
  decryptionKey?: string;
  superAdminOverride: boolean;
  /** Restrict the restore to these collections (empty = every collection). */
  collections: string[];
  /** Containment root the dispatcher resolved `backupPath` under. */
  storageDir?: string;
  /** Archive manifest, kept on the job for observability. */
  manifest?: BackupManifest;
};

export type BackupJobPayload = BackupCreateJobPayload | BackupRestoreJobPayload;

const IMPORT_CHUNK_SIZE = 100;

/**
 * Import documents with one engine call per chunk (findByIds / insertMany / upsertMany).
 * Shared by the sync LocalCMS importer and the background `import-data` job.
 */
export async function bulkImportCollectionDocuments(
  adapter: IDBAdapter,
  params: BulkImportParams,
  onProgress?: (state: BulkImportResult & { progress: number }) => Promise<void> | void,
): Promise<BulkImportResult> {
  const { collectionName, data, mode = "merge", duplicateStrategy = "skip", tenantId } = params;
  const tenantOpts = { tenantId: tenantId as DatabaseId };
  const total = data.length;
  const result: BulkImportResult = { imported: 0, skipped: 0, errors: 0, total };

  if (total === 0) return result;

  if (mode === "replace") {
    // 🛡️ CROSS-TENANT WIPE GUARD: replace mode with a missing/global tenant would
    // `deleteMany` the whole collection (confirmWipe bypasses the row-filter guard)
    // across every tenant. Fail closed instead.
    if (!tenantId || tenantId === "global") {
      throw new Error(
        "Replace-mode import requires a concrete tenantId to avoid cross-tenant data loss",
      );
    }
    const deleteResult = await adapter.crud.deleteMany(
      collectionName,
      {},
      {
        ...tenantOpts,
        confirmWipe: true,
      },
    );
    if (!deleteResult.success) {
      logger.warn(`[Import] Failed to clear collection ${collectionName} for replace mode`);
    }
  }

  for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
    const chunk = data.slice(i, i + IMPORT_CHUNK_SIZE);
    try {
      await importChunk(
        adapter,
        collectionName,
        chunk,
        mode,
        duplicateStrategy,
        tenantOpts,
        result,
      );
    } catch (innerError: unknown) {
      result.errors += chunk.length;
      logger.error(`[Import] Unexpected error during bulk import`, {
        error: innerError instanceof Error ? innerError.message : String(innerError),
        tenantId,
      });
    }
    if (onProgress) {
      await onProgress({
        ...result,
        progress: Math.round(((i + chunk.length) / total) * 100),
      });
    }
  }

  return result;
}

async function importChunk(
  adapter: IDBAdapter,
  collectionName: string,
  chunk: Record<string, unknown>[],
  mode: BulkImportMode,
  duplicateStrategy: BulkImportDuplicateStrategy,
  tenantOpts: { tenantId: DatabaseId },
  result: BulkImportResult,
): Promise<void> {
  const existingIds = new Set<string>();
  const docsWithIds = chunk.filter((doc) => typeof doc._id === "string" && doc._id.length > 0);

  if (mode !== "replace" && duplicateStrategy === "skip" && docsWithIds.length > 0) {
    const existing = await adapter.crud.findByIds(
      collectionName,
      docsWithIds.map((doc) => doc._id as DatabaseId),
      { ...tenantOpts, fields: ["_id"] },
    );
    if (existing.success && existing.data) {
      for (const item of existing.data) {
        if (item._id) {
          existingIds.add(String(item._id));
          result.skipped++;
        }
      }
    }
  }

  const itemsToInsert: Record<string, unknown>[] = [];
  const itemsToUpsert: Array<{ query: { _id: DatabaseId }; data: Record<string, unknown> }> = [];

  for (const doc of chunk) {
    const id = typeof doc._id === "string" ? doc._id : undefined;
    if (id && existingIds.has(id)) continue;

    if (mode === "replace" || !id || duplicateStrategy === "skip") {
      // Replace already deleted the table; skip already filtered existing ids.
      itemsToInsert.push(doc);
    } else {
      itemsToUpsert.push({ query: { _id: id as DatabaseId }, data: doc });
    }
  }

  const writeOpts = { ...tenantOpts, skipReturning: true };

  if (itemsToInsert.length > 0) {
    const insertResult = await adapter.crud.insertMany(
      collectionName,
      itemsToInsert as never,
      writeOpts,
    );
    if (insertResult.success) result.imported += itemsToInsert.length;
    else {
      result.errors += itemsToInsert.length;
      logger.warn(`[Import] Failed to bulk insert in ${collectionName}`, {
        error: insertResult.error,
        tenantId: tenantOpts.tenantId,
      });
    }
  }

  if (itemsToUpsert.length > 0) {
    const upsertResult = await adapter.crud.upsertMany(
      collectionName,
      itemsToUpsert as never,
      writeOpts,
    );
    if (upsertResult.success) result.imported += itemsToUpsert.length;
    else {
      result.errors += itemsToUpsert.length;
      logger.warn(`[Import] Failed to bulk upsert in ${collectionName}`, {
        error: upsertResult.error,
        tenantId: tenantOpts.tenantId,
      });
    }
  }
}

/** A row the import is about to write, as the publication gate sees it. */
interface PublishGateRow {
  collectionId: string;
  entry: Record<string, unknown>;
  /** The entry this write replaces (update lane); absent for a plain insert. */
  existingId?: string;
}

/** One collection's write batch, produced from a content-package plan. */
interface CollectionWriteBatch {
  collectionName: string;
  rows: Record<string, unknown>[];
}

/**
 * 🚪 Publication gate for a background import.
 *
 * The caller gates before dispatch, but a job can be replayed and the workflow
 * can change between dispatch and execution, so the worker re-checks every
 * publish transition itself instead of trusting the dispatcher. Admins and
 * collections without a publication-gated workflow keep their behaviour —
 * `assertPublishAllowed` decides, this function only supplies the actor. A job
 * has no session, so the actor comes from `payload.userId`; when a gate applies
 * and that actor cannot be resolved the import fails closed (permanently: the
 * same replay would fail identically).
 */
async function assertJobPublishAllowed(
  adapter: IDBAdapter,
  rows: readonly PublishGateRow[],
  tenantId: string | undefined,
  userId: string | undefined,
): Promise<void> {
  const publishing = rows.filter((row) => isPublishTransition(row.entry));
  if (publishing.length === 0) return;

  // A collection whose workflow absence is already known costs nothing: skip it
  // before the actor lookup and the workflow-service import.
  const gated = publishing.filter((row) => !workflowKnownAbsent(row.collectionId, tenantId));
  if (gated.length === 0) return;

  if (!userId) {
    throw new Error(
      "PERMANENT_FAILURE: This import would publish content in a workflow-gated collection, but the job carries no importing user",
    );
  }

  const resolved = await adapter.auth.getUserById(userId as DatabaseId, {
    tenantId: tenantId as DatabaseId,
  });
  if (!resolved.success || !resolved.data) {
    throw new Error(
      `PERMANENT_FAILURE: Import user "${userId}" could not be resolved, so publishing into a workflow-gated collection cannot be authorized`,
    );
  }
  const actor: User = resolved.data;

  const { workflowService } = await import("@src/services/background/workflow-service");
  for (const row of gated) {
    try {
      await workflowService.assertPublishAllowed(row.collectionId, tenantId, actor, row.existingId);
    } catch (err) {
      throw new Error(
        `PERMANENT_FAILURE: Import blocked by the publication gate for "${
          row.collectionId
        }": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Gate rows for the direct-import lane: the payload rows are the write rows.
 * Skip-mode rows are gated too — the gate describes what the payload asks for,
 * and re-reading which rows already exist would add a second findByIds.
 */
function gateRowsForCollection(
  collectionName: string,
  data: readonly Record<string, unknown>[],
  mode: BulkImportMode,
): PublishGateRow[] {
  return data.map((entry) => ({
    collectionId: collectionName,
    entry,
    // Replace mode deleted the collection first, so every row is a fresh insert.
    existingId:
      mode !== "replace" && typeof entry._id === "string" && entry._id.length > 0
        ? entry._id
        : undefined,
  }));
}

/**
 * Turn a content-package plan's pre-resolved operations into per-collection
 * write batches. Creates insert (no `_id`, so the target assigns one or matches
 * on identity — same as the synchronous lane); updates upsert against the
 * matched entry.
 *
 * Skips are already decided by the plan and stay skipped. A `conflict` is not a
 * skip: `planImport` only marks a duplicate `conflict` under the `"fail"`
 * strategy (every other strategy resolves the duplicate to `skip`, `update` or
 * `create`), so applying the plan has to refuse it the way the synchronous lane
 * does — otherwise a background import silently drops the entry and reports
 * success where the sync lane refuses to run the plan at all.
 */
function buildOperationBatches(
  operations: readonly ImportJobOperation[],
  tenantId: string | undefined,
): { batches: CollectionWriteBatch[]; skipped: number } {
  const batches = new Map<string, Record<string, unknown>[]>();
  let skipped = 0;

  for (const op of operations) {
    if (op.action === "conflict") {
      throw new Error(
        `PERMANENT_FAILURE: Import halted due to conflict in "${op.collection}": ${
          op.reason ?? "entry already exists"
        }`,
      );
    }
    if (op.action === "skip") {
      skipped++;
      continue;
    }

    const row: Record<string, unknown> = { ...op.entry };
    delete row._id;
    if (op.action === "update") {
      if (!op.existingId) {
        throw new Error(
          `PERMANENT_FAILURE: Import operation for "${op.collection}" is an update without a target entry`,
        );
      }
      delete row.createdAt;
      delete row.updatedAt;
      row._id = op.existingId;
    }
    if (tenantId) row.tenantId = tenantId;

    const rows = batches.get(op.collection);
    if (rows) rows.push(row);
    else batches.set(op.collection, [row]);
  }

  return {
    batches: [...batches].map(([collectionName, rows]) => ({ collectionName, rows })),
    skipped,
  };
}

/** Gate rows for the content-package lane: what each batch will actually write. */
function gateRowsOfBatches(batches: readonly CollectionWriteBatch[]): PublishGateRow[] {
  const rows: PublishGateRow[] = [];
  for (const batch of batches) {
    for (const entry of batch.rows) {
      rows.push({
        collectionId: batch.collectionName,
        entry,
        existingId: typeof entry._id === "string" ? entry._id : undefined,
      });
    }
  }
  return rows;
}

/**
 * Content-package lane: apply the plan's operations through the shared bulk
 * importer (one call per collection, so chunking and the imported/skipped/error
 * tallies stay identical to the direct lane).
 */
async function applyContentPackageOperations(
  adapter: IDBAdapter,
  operations: readonly ImportJobOperation[],
  context: {
    tenantId: string | undefined;
    userId: string | undefined;
    planId: string | undefined;
    job: Job;
    db: ReturnType<typeof getDb>;
  },
): Promise<void> {
  const { tenantId, userId, planId, job, db } = context;

  try {
    const { batches, skipped } = buildOperationBatches(operations, tenantId);

    logger.info(
      `[ImportJob] Starting content-package import${planId ? ` ${planId}` : ""} (${
        operations.length
      } operations across ${batches.length} collections)`,
      { jobId: job._id, tenantId },
    );

    // Before any write: the plan's publish transitions must still clear the gate.
    await assertJobPublishAllowed(adapter, gateRowsOfBatches(batches), tenantId, userId);

    const result: BulkImportResult = {
      imported: 0,
      skipped,
      errors: 0,
      total: operations.length,
    };
    // Skip operations are already decided, so they count as processed.
    let completed = skipped;

    for (const batch of batches) {
      const tally = await bulkImportCollectionDocuments(
        adapter,
        {
          collectionName: batch.collectionName,
          data: batch.rows,
          // The plan resolved duplicates already, so a replay must update the
          // matched row (`overwrite` upserts rows that carry the existing id)
          // rather than skip it.
          duplicateStrategy: "overwrite",
          tenantId,
        },
        async (state) => {
          if (!db?.system?.jobs) return;
          const processed = completed + state.imported + state.skipped + state.errors;
          await db.system.jobs.update(job._id, {
            progress: result.total === 0 ? 100 : Math.round((processed / result.total) * 100),
            metadata: {
              imported: result.imported + state.imported,
              skipped: result.skipped + state.skipped,
              errors: result.errors + state.errors,
              total: result.total,
            },
          });
        },
      );

      result.imported += tally.imported;
      result.skipped += tally.skipped;
      result.errors += tally.errors;
      completed += batch.rows.length;
    }

    logger.info(
      `[ImportJob] Completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`,
      {
        jobId: job._id,
        planId,
        tenantId,
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[ImportJob] Critical failure during import: ${message}`, {
      jobId: job._id,
      planId,
      tenantId,
    });
    throw error;
  }
}

/**
 * Background backup lane.
 *
 * The backup service queues its heavy `create`/`restore` work here (this is the
 * only long-running job lane), so the payload is a `backupTask`, not an import.
 * A restore writes content, so it passes the same publication gate as an
 * import: every publish transition in the archive is authorized for the actor
 * the job carries *before* the first collection is cleared, and the job fails
 * closed when that actor is missing or cannot be resolved. The write itself
 * stays in the backup service (archive validation, destructive per-tenant
 * clear, settings/roles, batching) so sync and background restores cannot
 * diverge.
 */
async function runBackupTask(
  adapter: IDBAdapter,
  payload: BackupJobPayload,
  job: Job,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  // Static import would close a cycle (backup-service → job-queue → this worker).
  const { backupService } = await import("@src/services/core/backup-service");
  let tenantId: string | undefined;

  if (payload.backupTask === "create") {
    tenantId = payload.tenantId;
    const result = await backupService.createBackup({
      tenantId: payload.tenantId,
      userId: payload.userId,
      includeMedia: payload.includesMedia,
      encryptionKey: payload.encryptionKey,
      storageDir: payload.storageDir,
      label: payload.label,
      // This job *is* the background run — never queue another one.
      background: false,
    });
    if (!result.success) {
      throw new Error(`PERMANENT_FAILURE: Background backup failed: ${result.message}`);
    }
  } else {
    tenantId = payload.targetTenant;
    const collections = await backupService.readBackupCollections(payload.backupPath, {
      decryptionKey: payload.decryptionKey,
      collections: payload.collections,
      storageDir: payload.storageDir,
    });

    const rows: PublishGateRow[] = [];
    for (const { collection, entries } of collections) {
      for (const entry of entries) rows.push({ collectionId: collection, entry });
    }

    // A restore replaces each backed-up collection (clear, then insert), so
    // every backed-up entry is a fresh write and its publish transition must be
    // authorized before anything is deleted.
    await assertJobPublishAllowed(adapter, rows, payload.targetTenant, payload.userId);

    const result = await backupService.restoreBackup(payload.backupPath, {
      // The plan-first confirmation happened before the job was queued.
      confirmed: true,
      tenantId: payload.targetTenant,
      userId: payload.userId,
      superAdminOverride: payload.superAdminOverride,
      decryptionKey: payload.decryptionKey,
      collections: payload.collections,
      storageDir: payload.storageDir,
      // This job *is* the background run — never queue another one.
      background: false,
    });
    if (!result.success) {
      throw new Error(`PERMANENT_FAILURE: Background restore failed: ${result.message}`);
    }
  }

  if (db?.system?.jobs) {
    await db.system.jobs.update(job._id, { progress: 100 });
  }
  logger.info(`[ImportJob] Background ${payload.backupTask} finished`, {
    jobId: job._id,
    tenantId,
  });
}

export const importDataHandler: JobHandler = async (
  payload: ImportJobPayload | BackupJobPayload,
  job: Job,
) => {
  const db = getDb();

  if (!dbAdapter) {
    throw new Error("PERMANENT_FAILURE: Database adapter not initialized");
  }

  if ("backupTask" in payload) {
    await runBackupTask(dbAdapter, payload, job, db);
    return;
  }

  const { tempPayloadId, tenantId, userId, planId } = payload;
  const mode = payload.mode ?? "merge";
  const duplicateStrategy = payload.duplicateStrategy ?? "skip";
  const operations = Array.isArray(payload.operations) ? payload.operations : undefined;
  let { collectionName, data } = payload;

  if (operations) {
    await applyContentPackageOperations(dbAdapter, operations, {
      tenantId,
      userId,
      planId,
      job,
      db,
    });
    return;
  }

  if (!data && tempPayloadId) {
    logger.debug(`[ImportJob] Retrieving large payload from temp store: ${tempPayloadId}`);
    data = await getTempPayload(tempPayloadId);
  }

  if (!data || !Array.isArray(data)) {
    throw new Error("PERMANENT_FAILURE: No data provided for import");
  }

  if (!collectionName) {
    throw new Error("PERMANENT_FAILURE: No collection name provided for import");
  }

  logger.info(
    `[ImportJob] Starting background import for ${collectionName} (${data.length} items)`,
    {
      jobId: job._id,
      tenantId,
    },
  );

  try {
    // Before any write — and before replace mode's deleteMany — so a rejected
    // import leaves no wiped collection behind.
    await assertJobPublishAllowed(
      dbAdapter,
      gateRowsForCollection(collectionName, data, mode),
      tenantId,
      userId,
    );

    const tally = await bulkImportCollectionDocuments(
      dbAdapter,
      { collectionName, data, mode, duplicateStrategy, tenantId },
      async (state) => {
        if (!db?.system?.jobs) return;
        await db.system.jobs.update(job._id, {
          progress: state.progress,
          metadata: {
            imported: state.imported,
            skipped: state.skipped,
            errors: state.errors,
            total: state.total,
          },
        });
      },
    );

    if (tempPayloadId) {
      await deleteTempPayload(tempPayloadId);
    }

    logger.info(
      `[ImportJob] Completed: ${tally.imported} imported, ${tally.skipped} skipped, ${tally.errors} errors`,
      {
        jobId: job._id,
        collection: collectionName,
        tenantId,
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[ImportJob] Critical failure during import: ${message}`, {
      jobId: job._id,
      collection: collectionName,
      tenantId,
    });
    throw error;
  }
};
