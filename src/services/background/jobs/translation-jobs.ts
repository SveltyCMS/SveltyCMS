/**
 * @file src/services/jobs/translation-jobs.ts
 * @description Background job handler for bulk content translation.
 */

import { dbAdapter, getDb } from "@src/databases/db";
import { logger } from "@utils/logger";
import { aiService } from "@src/services/core/ai-service";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import type { JobHandler } from "./job-queue-service";
import type { Job } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";

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
  const defaultLang = (
    sourceLanguage ||
    getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE", tenantId) ||
    "en"
  ).toLowerCase();

  if (!dbAdapter) throw new Error("PERMANENT_FAILURE: Database adapter not initialized");

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

  // 2. Fetch all entries
  const entriesResult = await dbAdapter.crud.findMany(
    collectionName,
    {},
    { tenantId: tenantId as any },
  );
  if (!entriesResult.success) throw new Error(`Failed to fetch entries: ${entriesResult.message}`);

  const entries = entriesResult.data;
  const total = entries.length;

  logger.info(`[TranslationJob] Starting bulk translation for ${total} items in ${collectionName}`);

  let translatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < total; i++) {
    const entry = entries[i] as any;
    let updated = false;

    for (const lang of targetLanguages) {
      if (lang === defaultLang) continue;

      for (const field of translatableFields) {
        const values = (entry[field] || {}) as Record<string, string>;
        const sourceText = values[defaultLang];

        // Only translate if source exists and target is empty
        if (sourceText && !values[lang]) {
          try {
            const translation = await aiService.enrichText(sourceText, "translate", lang);
            if (translation) {
              values[lang] = translation;
              entry[field] = values;
              updated = true;
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
      await dbAdapter.crud.update(collectionName, entry._id, entry, { tenantId: tenantId as any });
      translatedCount++;
    }

    // Update progress
    if (db?.system?.jobs) {
      const progress = Math.round(((i + 1) / total) * 100);
      await db.system.jobs.update(job._id, {
        progress,
        metadata: { translatedCount, skippedCount, errorCount, total },
      });
    }
  }

  logger.info(`[TranslationJob] Completed: ${translatedCount} updated, ${errorCount} errors`);
};
