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
  tenantId?: string | null; // Add tenantId for multi-tenancy
  type: string;
  user: User;
}

// Function to modify request data based on field widgets
export async function modifyRequest({
  data,
  fields,
  collection,
  user,
  type,
  tenantId,
  collectionName,
}: ModifyRequestParams) {
  const start = performance.now();
  try {
    // User access is already validated by hooks
    logger.trace(
      `Startingmodify-requestfor type: ${type}, user: ${user._id}, collection: ${collectionName ?? (collection as unknown as { id?: string }).id ?? "unknown"}, tenant: ${tenantId}`,
    );

    for (const field of fields) {
      const fieldStart = performance.now();
      // Access widget from store
      const widget = widgets.widgetFunctions[field.widget.Name];
      const fieldName = getFieldName(field);

      logger.trace(`Processing field: ${fieldName}, widget: ${field.widget.Name}`);

      // Resolve potential modify-request handler
      const modifyFn = widget?.modifyRequest;
      const modifyBatchFn = widget?.modifyRequestBatch;

      if (modifyBatchFn && typeof modifyBatchFn === "function") {
        // --- BATCH PROCESSING ---
        logger.trace(`Processing batch for field: ${fieldName}, widget: ${field.widget.Name}`);
        try {
          const batchStart = performance.now();

          // Call batch function
          const batchResults = await modifyBatchFn({
            data: data as Record<string, unknown>[],
            collection,
            field,
            user,
            type,
            tenantId,
            collectionName,
          });

          // Update data with results
          if (Array.isArray(batchResults) && batchResults.length === data.length) {
            // Update the original array elements to ensure changes are returned
            for (let i = 0; i < data.length; i++) {
              data[i] = batchResults[i] as EntryData;
            }
          } else {
            logger.warn(
              `Batch processing for ${fieldName} returned invalid results length. Expected ${data.length}, got ${batchResults?.length}`,
            );
          }

          const batchDuration = performance.now() - batchStart;
          logger.debug(
            `Batch processing for ${fieldName} completed in ${batchDuration.toFixed(2)}ms`,
          );
        } catch (batchError) {
          const errorMessage =
            batchError instanceof Error ? batchError.message : "Unknown batch error";
          logger.error(`Batch widget error for field ${fieldName}: ${errorMessage}`);
        }
      } else if (modifyFn && typeof modifyFn === "function") {
        // --- VECTORIZED CHUNKED PROCESSING ---
        // Process in chunks to keep event loop responsive while maintaining high throughput
        const chunkSize = 100;
        const totalItems = data.length;

        for (let i = 0; i < totalItems; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);

          // Process chunk in parallel
          const results = await Promise.all(
            chunk.map(async (entry) => {
              try {
                // Use a copy to prevent accidental side effects across fields
                const entryCopy = { ...entry };
                const dataAccessor: DataAccessor<unknown> = {
                  get() {
                    return entryCopy[fieldName];
                  },
                  update(newData) {
                    entryCopy[fieldName] = newData;
                  },
                };

                await modifyFn({
                  collection,
                  field,
                  data: dataAccessor,
                  user,
                  type,
                  tenantId,
                  collectionName,
                });
                return entryCopy;
              } catch (widgetError) {
                const errorMessage =
                  widgetError instanceof Error ? widgetError.message : "Unknown widget error";
                logger.error(`[Vectorized] Widget error for field ${fieldName}: ${errorMessage}`);
                return entry; // Fallback to original entry on failure
              }
            }),
          );

          // Update original data array with processed results
          for (let j = 0; j < results.length; j++) {
            data[i + j] = results[j];
          }

          // Yield to event loop if more chunks remain, prevents blocking on massive imports
          if (i + chunkSize < totalItems) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }

        const fieldDuration = performance.now() - fieldStart;
        logger.trace(`Field ${fieldName} vectorized in ${fieldDuration.toFixed(2)}ms`);
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
