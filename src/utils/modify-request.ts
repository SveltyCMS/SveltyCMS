/**
 * @file src/routes/api/collections/modify-request.ts
 * @description
 * Advanced request modification utility for collection data.
 * Intercepts incoming requests to:
 * - Transform data based on widget configurations.
 * - Resolve environmental and contextual tokens.
 * - Apply tenant-specific constraints and defaults.
 *
 * features:
 * - batch widget processing
 * - tenant-aware data manipulation
 * - token resolution
 * - performance monitoring
 */

import type { FieldInstance } from "@src/content/types";
// Types
import type { User } from "@src/databases/auth/types";
import type { CollectionModel } from "@src/databases/db-interface";
import { widgets } from "@src/stores/widget-store.svelte";
import { logger } from "@utils/logger.server";
import { getFieldName } from "@utils/utils";

interface DataAccessor<T> {
  get(): T;
  update(newData: T): void;
}

interface EntryData {
  _id?: string;
  meta_data?: Record<string, unknown>;
  [key: string]: unknown;
}

// Define the parameters for the function
interface ModifyRequestParams {
  collection: CollectionModel;
  collectionName?: string;
  data: EntryData[];
  fields: FieldInstance[];
  tenantId?: string | null;
  type: string;
  user: User;
  skipValidation?: boolean;
  action?: string;
}

import { canAccessField, enforceFieldAccess } from "@src/utils/field-access";

// Function to modify request data based on field widgets
export async function modifyRequest({
  data,
  fields,
  collection,
  user,
  type,
  tenantId,
  collectionName,
  skipValidation = false,
  action,
}: ModifyRequestParams) {
  const start = performance.now();
  try {
    const operation = type === "GET" ? "read" : "write";

    // 1. Initial FLAC Sanitization (Physical field stripping)
    for (let i = 0; i < data.length; i++) {
      data[i] = (await enforceFieldAccess(fields, data[i] as any, user, operation, {
        collectionName,
        tenantId: tenantId ?? undefined,
        entryId: (data[i] as any)._id,
      })) as EntryData;
    }

    // User access is already validated by hooks
    logger.trace(
      `Starting modify-request for type: ${type}, user: ${user._id}, collection: ${collectionName ?? (collection as unknown as { id?: string }).id ?? "unknown"}, tenant: ${tenantId}, operation: ${operation}`,
    );

    // Optimize field iteration
    for (const field of fields) {
      // 2. Runtime FLAC Check (Skip widget logic if field is blocked)
      if (!canAccessField(field, user, operation)) continue;

      const widget = widgets.widgetFunctions[field.widget.Name];
      if (!widget) continue;

      const modifyFn = widget.modifyRequest;
      const modifyBatchFn = widget.modifyRequestBatch;

      if (!modifyFn && !modifyBatchFn) continue;

      const fieldName = getFieldName(field);

      if (modifyBatchFn) {
        // --- BATCH PROCESSING (Fastest) ---
        try {
          const batchResults = await modifyBatchFn({
            data: data as Record<string, unknown>[],
            collection,
            field,
            user,
            type,
            tenantId,
            collectionName,
            skipValidation,
            action,
          });

          if (Array.isArray(batchResults) && batchResults.length === data.length) {
            for (let i = 0; i < data.length; i++) {
              data[i] = batchResults[i] as EntryData;
            }
          }
        } catch (batchError) {
          logger.error(
            `Batch widget error for field ${fieldName}: ${batchError instanceof Error ? batchError.message : batchError}`,
          );
        }
      } else if (modifyFn) {
        // --- VECTORIZED PROCESSING ---
        const chunkSize = 100;
        const totalItems = data.length;

        for (let i = 0; i < totalItems; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);

          // Process chunk in parallel
          const results = await Promise.all(
            chunk.map(async (entry) => {
              try {
                // Optimized: Only copy if we absolute must, but here we keep for safety
                // but use a more efficient accessor
                const entryCopy = { ...entry };
                const dataAccessor: DataAccessor<unknown> = {
                  get: () => entryCopy[fieldName],
                  update: (newData) => {
                    entryCopy[fieldName] = newData;
                  },
                };

                await (modifyFn as any)({
                  collection,
                  field,
                  data: dataAccessor,
                  user,
                  type,
                  tenantId,
                  collectionName,
                  skipValidation,
                  action,
                });
                return entryCopy;
              } catch {
                return entry;
              }
            }),
          );

          for (let j = 0; j < results.length; j++) {
            data[i + j] = results[j];
          }

          // Yield sparingly
          if (totalItems > 500 && i + chunkSize < totalItems) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }
    }

    const duration = performance.now() - start;
    logger.info(`ModifyRequest completed in ${duration.toFixed(2)}ms for ${data.length} entries`);

    return data;
  } catch (error) {
    const duration = performance.now() - start;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    logger.error(`ModifyRequest failed after ${duration.toFixed(2)}ms: ${errorMessage}`, {
      stack: errorStack,
    });
    throw error;
  }
}
