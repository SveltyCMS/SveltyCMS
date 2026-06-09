/**
 * @file src/services/jobs/import-jobs.ts
 * @description Background job handler for large-scale data imports.
 */

import { dbAdapter, getDb } from "@src/databases/db";
import { logger } from "@utils/logger";
import type { JobHandler } from "./job-queue-service";
import { getTempPayload, deleteTempPayload } from "@utils/temp-store";
import type { Job, DatabaseId } from "@src/databases/db-interface";

export const importDataHandler: JobHandler = async (
  payload: {
    collectionName: string;
    data?: any[];
    tempPayloadId?: string;
    mode: "merge" | "replace";
    duplicateStrategy: "skip" | "overwrite";
    tenantId?: string;
  },
  job: Job,
) => {
  let { collectionName, data, tempPayloadId, mode, duplicateStrategy, tenantId } = payload;

  const db = getDb();

  // If data is missing but tempPayloadId is present, retrieve it
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

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Handle replace mode
    if (mode === "replace") {
      const deleteResult = await dbAdapter.crud.deleteMany(
        collectionName,
        {},
        { tenantId: tenantId as DatabaseId },
      );
      if (!deleteResult.success) {
        logger.warn(`[ImportJob] Failed to clear collection ${collectionName} for replace mode`);
      }
    }

    // Process in chunks to avoid memory pressure and allow progress tracking
    const chunkSize = 100;
    const total = data.length;

    for (let i = 0; i < total; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);

      // High-Performance Bulk Processing Path
      const itemsToUpsert: any[] = [];
      const itemsToInsert: any[] = [];

      try {
        // Optimize duplicate checking: fetch all existing IDs in one query
        const docsWithIds = chunk.filter((doc) => doc._id);
        const existingIds = new Set<string>();

        if (duplicateStrategy === "skip" && docsWithIds.length > 0) {
          const ids = docsWithIds.map((doc) => doc._id);
          const existing = await dbAdapter.crud.findByIds(collectionName, ids, {
            tenantId: tenantId as DatabaseId,
            fields: ["_id"] as any,
          });
          if (existing.success && existing.data) {
            for (const item of existing.data) {
              if (item._id) {
                existingIds.add(item._id as string);
                skipped++;
              }
            }
          }
        }

        // Segregate chunk into inserts vs upserts
        for (const doc of chunk) {
          if (doc._id && existingIds.has(doc._id)) continue;

          if (doc._id) {
            itemsToUpsert.push({ query: { _id: doc._id }, data: doc });
          } else {
            itemsToInsert.push(doc);
          }
        }

        // Execute bulk insertMany
        if (itemsToInsert.length > 0) {
          const insertResult = await dbAdapter.crud.insertMany(collectionName, itemsToInsert, {
            tenantId: tenantId as DatabaseId,
          });
          if (insertResult.success) {
            imported += itemsToInsert.length;
          } else {
            errors += itemsToInsert.length;
            logger.warn(`[ImportJob] Failed to bulk insert in ${collectionName}`, {
              error: insertResult.error,
              tenantId,
            });
          }
        }

        // Execute bulk upsertMany
        if (itemsToUpsert.length > 0) {
          const upsertResult = await dbAdapter.crud.upsertMany(collectionName, itemsToUpsert, {
            tenantId: tenantId as DatabaseId,
          });
          if (upsertResult.success) {
            imported += itemsToUpsert.length;
          } else {
            errors += itemsToUpsert.length;
            logger.warn(`[ImportJob] Failed to bulk upsert in ${collectionName}`, {
              error: upsertResult.error,
              tenantId,
            });
          }
        }
      } catch (innerError: unknown) {
        errors += chunk.length;
        logger.error(`[ImportJob] Unexpected error during bulk import`, {
          error: innerError instanceof Error ? innerError.message : String(innerError),
          tenantId,
        });
      }

      // Update progress in DB
      if (db?.system?.jobs) {
        const progress = Math.round(((i + chunk.length) / total) * 100);
        await db.system.jobs.update(job._id, {
          progress,
          metadata: { imported, skipped, errors, total },
        });
      }
    }

    // Clean up temp store if used
    if (tempPayloadId) {
      await deleteTempPayload(tempPayloadId);
    }

    logger.info(
      `[ImportJob] Completed: ${imported} imported, ${skipped} skipped, ${errors} errors`,
      {
        jobId: job._id,
        collection: collectionName,
        tenantId,
      },
    );
  } catch (error: any) {
    logger.error(`[ImportJob] Critical failure during import: ${error.message}`, {
      jobId: job._id,
      collection: collectionName,
      tenantId,
    });
    throw error;
  }
};
