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
import { logger } from "@utils/logger";
import { getFieldName } from "@utils/utils";

interface DataAccessor<T> {
  get(): T;
  update(newData: T): void;
}

export interface EntryData {
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
  system?: boolean;
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
  system = false,
}: ModifyRequestParams) {
  const start = performance.now();
  if (!data || data.length === 0) return data;

  try {
    const operation = type === "GET" ? "read" : "write";

    // 1. Initial FLAC Sanitization (Physical field stripping)
    // 🚀 Performance Optimization: Skip FLAC for system operations to avoid heavy audit logging and permission lookups
    if (!system) {
      // 🚀 Parallel FLAC Sanitization: Use Promise.all to process entries concurrently
      // We only run FLAC if we have a real user context and the user is NOT an admin
      if (user && user._id !== "system" && user.role !== "admin") {
        if (data.length === 1) {
          data[0] = (await enforceFieldAccess(fields, data[0] as any, user, operation, {
            collectionName,
            tenantId: tenantId ?? undefined,
            entryId: (data[0] as any)._id,
          })) as EntryData;
        } else {
          await Promise.all(
            data.map(async (item, i) => {
              data[i] = (await enforceFieldAccess(fields, item as any, user, operation, {
                collectionName,
                tenantId: tenantId ?? undefined,
                entryId: (item as any)._id,
              })) as EntryData;
            }),
          );
        }
      }
    }

    // Optimize field iteration - Filter widgets once
    const activeWidgets = fields
      .map((f) => ({
        field: f,
        name: getFieldName(f),
        widget: widgets.widgetFunctions[f.widget.Name],
      }))
      .filter((w) => w.widget && (w.widget.modifyRequest || w.widget.modifyRequestBatch));

    if (activeWidgets.length === 0) return data;

    for (const { field, name, widget } of activeWidgets) {
      // 2. Runtime FLAC Check (Skip widget logic if field is blocked)
      if (!system && user && user._id !== "system" && !canAccessField(field, user, operation))
        continue;

      const modifyFn = widget.modifyRequest;
      const modifyBatchFn = widget.modifyRequestBatch;

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
            `Batch widget error for field ${name}: ${batchError instanceof Error ? batchError.message : batchError}`,
          );
        }
      } else if (modifyFn) {
        // --- VECTORIZED PROCESSING ---
        // Optimization: For small sets, skip parallel chunking overhead
        if (data.length === 1) {
          const entry = data[0];
          const dataAccessor: DataAccessor<unknown> = {
            get: () => entry[name],
            update: (newData) => {
              entry[name] = newData;
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
          continue;
        }

        const chunkSize = 100;
        const totalItems = data.length;

        for (let i = 0; i < totalItems; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);

          // Process chunk in parallel
          await Promise.all(
            chunk.map(async (entry) => {
              try {
                const dataAccessor: DataAccessor<unknown> = {
                  get: () => entry[name],
                  update: (newData) => {
                    entry[name] = newData;
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
              } catch {
                // ignore
              }
            }),
          );

          // Yield sparingly to keep event loop responsive
          if (totalItems > 1000 && i + chunkSize < totalItems) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }
    }

    const duration = performance.now() - start;
    if (duration > 5) {
      logger.debug(
        `ModifyRequest completed in ${duration.toFixed(2)}ms for ${data.length} entries`,
      );
    }

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

/**
 * 🚀 STREAMING CORE: Transforms a stream of entries per-item.
 */
export async function* modifyStream(
  stream: AsyncIterable<EntryData>,
  params: Omit<ModifyRequestParams, "data">,
) {
  for await (const item of stream) {
    const data = [item];
    await modifyRequest({ ...params, data });
    yield data[0];
  }
}
