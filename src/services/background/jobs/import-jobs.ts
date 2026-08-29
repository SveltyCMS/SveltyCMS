/**
 * @file src/services/background/jobs/import-jobs.ts
 * @description Background job handler and shared bulk importer for collection documents.
 *
 * Features:
 * - findByIds + insertMany / upsertMany (no per-document findOne)
 * - replace mode: one deleteMany then insertMany
 * - skip mode: one findByIds then insertMany of missing rows
 * - overwrite mode: insertMany (no _id) + upsertMany (has _id)
 */

import { dbAdapter, getDb } from "@src/databases/db";
import { logger } from "@utils/logger";
import type { JobHandler } from "./job-queue-service";
import { getTempPayload, deleteTempPayload } from "@utils/temp-store";
import type { DatabaseId, IDBAdapter, Job } from "@src/databases/db-interface";

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
    const deleteResult = await adapter.crud.deleteMany(collectionName, {}, tenantOpts);
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

export const importDataHandler: JobHandler = async (
  payload: {
    collectionName: string;
    data?: Record<string, unknown>[];
    tempPayloadId?: string;
    mode: BulkImportMode;
    duplicateStrategy: BulkImportDuplicateStrategy;
    tenantId?: string;
  },
  job: Job,
) => {
  let { collectionName, data, tempPayloadId, mode, duplicateStrategy, tenantId } = payload;

  const db = getDb();

  if (!data && tempPayloadId) {
    logger.debug(`[ImportJob] Retrieving large payload from temp store: ${tempPayloadId}`);
    data = await getTempPayload(tempPayloadId);
  }

  if (!data || !Array.isArray(data)) {
    throw new Error("PERMANENT_FAILURE: No data provided for import");
  }

  if (!dbAdapter) {
    throw new Error("PERMANENT_FAILURE: Database adapter not initialized");
  }

  logger.info(
    `[ImportJob] Starting background import for ${collectionName} (${data.length} items)`,
    {
      jobId: job._id,
      tenantId,
    },
  );

  try {
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
