/**
 * @file src/services/jobs/translation-jobs.ts
 * @description Background job handler for bulk content translation.
 *
 * ### Features:
 * - paginated collection scan (never loads the whole collection at once)
 * - bounded per-page concurrency
 * - delegates to `aiTranslationService.translateField` (cache + rate limit + audit)
 * - throttled progress writes (~5% or 2s)
 */

import { dbAdapter, getDb } from "@src/databases/db";
import { logger } from "@utils/logger";
import { aiTranslationService } from "@src/services/ai-translation";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import type { JobHandler } from "./job-queue-service";
import type { BaseQueryOptions, DatabaseId, Job } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";

/** Entries fetched per page — keeps the working set bounded. */
const FETCH_PAGE_SIZE = 100;
/** Entries translated concurrently within a page. */
const ENTRY_CONCURRENCY = 5;
/** Persist progress at most every ~5% or 2s (whichever comes first). */
const PROGRESS_MIN_DELTA = 5;
const PROGRESS_MIN_INTERVAL_MS = 2_000;

/** Run `worker` over `items` with at most `limit` in flight. */
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      await worker(items[current]);
    }
  });
  await Promise.all(workers);
}

type RowUpdater = (
  collection: string,
  id: DatabaseId,
  data: Record<string, unknown>,
  options?: BaseQueryOptions,
) => Promise<unknown>;

export const bulkTranslateHandler: JobHandler = async (
  payload: {
    collectionName: string;
    targetLanguages: string[];
    sourceLanguage?: string;
    tenantId?: string;
  },
  job: Job,
) => {
  const { collectionName, targetLanguages, sourceLanguage, tenantId } = payload;
  const db = getDb();
  const jobsApi = db?.system?.jobs;
  const jobId = job._id;
  const defaultLang = (
    sourceLanguage ||
    getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE", tenantId) ||
    "en"
  ).toLowerCase();

  if (!dbAdapter) throw new Error("PERMANENT_FAILURE: Database adapter not initialized");

  const tenantScope: BaseQueryOptions = {
    tenantId: (tenantId as unknown as DatabaseId) ?? undefined,
  };

  // 1. Get Collection Schema to identify translatable fields
  const schemasResult = await dbAdapter.collection.listSchemas(tenantId as any);
  const schemas = schemasResult.success ? schemasResult.data : [];
  const schema = schemas.find((c: Schema) => c.name === collectionName);

  if (!schema) throw new Error(`PERMANENT_FAILURE: Collection ${collectionName} not found`);

  const translatableFields = (schema.fields as any[])
    .filter((f) => f.translated)
    .map((f) => f.db_fieldName);

  if (translatableFields.length === 0) {
    logger.info(`[TranslationJob] No translatable fields in ${collectionName}. Completing.`);
    return;
  }

  // 2. Total for progress reporting (best effort — failures fall back to 0/unknown)
  const countResult = await dbAdapter.crud.count(collectionName, {}, tenantScope);
  const total = countResult.success && typeof countResult.data === "number" ? countResult.data : 0;

  logger.info(`[TranslationJob] Starting bulk translation for ${total} items in ${collectionName}`);

  let translatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let done = 0;
  let lastProgress = -1;
  let lastProgressAt = 0;

  const reportProgress = async (force = false) => {
    if (!jobsApi || !jobId) return;
    const progress = total > 0 ? Math.round((done / total) * 100) : 100;
    const now = Date.now();
    if (
      !force &&
      progress - lastProgress < PROGRESS_MIN_DELTA &&
      now - lastProgressAt < PROGRESS_MIN_INTERVAL_MS
    ) {
      return;
    }
    lastProgress = progress;
    lastProgressAt = now;
    await jobsApi
      .update(jobId, {
        progress,
        metadata: { translatedCount, skippedCount, errorCount, total },
      })
      .catch((err: unknown) => {
        logger.debug("[TranslationJob] Progress update failed", err);
      });
  };

  const updateRow = dbAdapter.crud.update as unknown as RowUpdater;

  const translateEntry = async (entry: Record<string, unknown>): Promise<void> => {
    let updated = false;

    for (const lang of targetLanguages) {
      if (lang === defaultLang) continue;

      for (const field of translatableFields) {
        const values = (entry[field] || {}) as Record<string, string>;
        const sourceText = values[defaultLang];

        // Only translate if source exists and target is empty
        if (sourceText && !values[lang]) {
          try {
            const translation = await aiTranslationService.translateField(
              sourceText,
              defaultLang,
              lang,
              {
                field,
                collection: collectionName,
                tenantId: (tenantId as unknown as DatabaseId) ?? null,
              },
            );
            if (translation) {
              values[lang] = translation;
              entry[field] = values;
              updated = true;
            } else {
              errorCount++;
            }
          } catch (err) {
            errorCount++;
            logger.error(`[TranslationJob] Error translating ${field} for ${entry._id}:`, err);
          }
        } else {
          skippedCount++;
        }
      }
    }

    if (updated) {
      await updateRow(collectionName, entry._id as DatabaseId, entry, tenantScope);
      translatedCount++;
    }
  };

  // 3. Page through the collection, translating a bounded batch at a time.
  let offset = 0;
  while (true) {
    const entriesResult = await dbAdapter.crud.findMany(
      collectionName,
      {},
      {
        ...tenantScope,
        limit: FETCH_PAGE_SIZE,
        offset,
        sort: { _id: "asc" },
      },
    );
    if (!entriesResult.success) {
      throw new Error(`Failed to fetch entries: ${entriesResult.message}`);
    }

    const page = (entriesResult.data || []) as unknown as Array<Record<string, unknown>>;
    if (page.length === 0) break;

    await runWithConcurrency(page, ENTRY_CONCURRENCY, async (entry) => {
      await translateEntry(entry);
      done++;
      await reportProgress();
    });

    if (page.length < FETCH_PAGE_SIZE) break;
    offset += page.length;
  }

  await reportProgress(true);

  logger.info(`[TranslationJob] Completed: ${translatedCount} updated, ${errorCount} errors`);
};
