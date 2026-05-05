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

      for (const doc of chunk) {
        try {
          // Check for duplicates if strategy is skip
          if (duplicateStrategy === "skip" && doc._id) {
            const existing = await dbAdapter.crud.findOne(
              collectionName,
              { _id: doc._id },
              { tenantId: tenantId as DatabaseId },
            );
            if (existing.success && existing.data) {
              skipped++;
              continue;
            }
          }

          // Insert or update document
          const result = doc._id
            ? await dbAdapter.crud.upsert(collectionName, { _id: doc._id }, doc, {
                tenantId: tenantId as DatabaseId,
              })
            : await dbAdapter.crud.insert(collectionName, doc, {
                tenantId: tenantId as DatabaseId,
              });

          if (result.success) {
            imported++;
          } else {
            errors++;
            logger.warn(`[ImportJob] Failed to import document in ${collectionName}`, {
              error: result.error,
              tenantId,
            });
          }
        } catch (innerError: any) {
          errors++;
          logger.error(`[ImportJob] Unexpected error importing document`, {
            error: innerError.message,
            tenantId,
          });
        }
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
