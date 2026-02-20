/**
 * @file src/routes/api/collections/modify-request.ts
 * @description Utility function for modifyin							const entryDuration = performance.now() - entryStart;
							logger.trace(`Entry ${index + 1} processed in ${entryDuration.toFixed(2)}ms`);request data based on field widgets.
 *
 * This module provides functionality to:
 * - Process each field in a collection schema
 * - Apply widget-specific modifications to the request data, now with tenant context.
 * - Handle custom widget logic for different request types (GET, POST, etc.)
 *
 * Features:
 * - Support for custom widget-based data modifications
 * - Asynchronous processing of each entry in the data array
 * - Data accessor pattern for safe data manipulation
 * - Performance monitoring
 * - Detailed logging for debugging purposes
 *
 * Usage:
 * Called by various collection handlers (GET, POST, etc.) to modify request data
 * before final processing or database operations.
 */

import type { FieldInstance } from '@src/content/types';
// Types
import type { User } from '@src/databases/auth/types';
import type { CollectionModel } from '@src/databases/db-interface';
import { widgets } from '@src/stores/widget-store.svelte.ts';
// System logger
import { logger } from '@utils/logger.server';
import { getFieldName } from '@utils/utils';

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
	tenantId?: string; // Add tenantId for multi-tenancy
	type: string;
	user: User;
}

// Function to modify request data based on field widgets
export async function modifyRequest({ data, fields, collection, user, type, tenantId, collectionName }: ModifyRequestParams) {
	const start = performance.now();
	try {
		// User access is already validated by hooks
		logger.trace(
			`Startingmodify-requestfor type: ${type}, user: ${user._id}, collection: ${collectionName ?? (collection as unknown as { id?: string }).id ?? 'unknown'}, tenant: ${tenantId}`
		);

		for (const field of fields) {
			const fieldStart = performance.now();
			// Access widget from store with proper type casting
			const widget = widgets.widgetFunctions[field.widget.Name];
			const fieldName = getFieldName(field);

			logger.trace(`Processing field: ${fieldName}, widget: ${field.widget.Name}`);

			// Resolve potentialmodify-requesthandler in a type-safe way
			const modifyFn = (widget as unknown as { modifyRequest?: unknown })?.modifyRequest;
			const modifyBatchFn = (widget as unknown as { modifyRequestBatch?: unknown })?.modifyRequestBatch;

			if (modifyBatchFn && typeof modifyBatchFn === 'function') {
				// --- BATCH PROCESSING ---
				logger.trace(`Processing batch for field: ${fieldName}, widget: ${field.widget.Name}`);
				try {
					const batchStart = performance.now();
					// Extract data for this field
					// const fieldData = data.map((entry) => entry[fieldName]);

					// Call batch function
					const batchResults = (await modifyBatchFn({
						data: data as unknown as Record<string, unknown>[],
						collection: collection as unknown as Record<string, unknown>,
						field: field as unknown as Record<string, unknown>,
						user: user as unknown as Record<string, unknown>,
						type: type as unknown as string,
						tenantId: tenantId as unknown as string | undefined,
						collectionName: collectionName as unknown as string | undefined
					})) as Record<string, unknown>[];

					// Update data with results
					if (Array.isArray(batchResults) && batchResults.length === data.length) {
						data = batchResults as EntryData[];
					} else {
						logger.warn(`Batch processing for ${fieldName} returned invalid results length. Expected ${data.length}, got ${batchResults?.length}`);
					}

					const batchDuration = performance.now() - batchStart;
					logger.debug(`Batch processing for ${fieldName} completed in ${batchDuration.toFixed(2)}ms`);
				} catch (batchError) {
					const errorMessage = batchError instanceof Error ? batchError.message : 'Unknown batch error';
					logger.error(`Batch widget error for field ${fieldName}: ${errorMessage}`);
					// Fallback to individual processing could be implemented here if needed,
					// but for now we let it fail or continue with unmodified data?
					// Ideally we should probably re-throw or handle gracefully.
				}
			} else if (modifyFn !== undefined && modifyFn !== null && typeof modifyFn === 'function') {
				// --- INDIVIDUAL PROCESSING (Legacy/Fallback) ---
				data = await Promise.all(
					data.map(async (entry: EntryData, index: number) => {
						// const entryStart = performance.now();
						try {
							const entryCopy = { ...entry };
							const dataAccessor: DataAccessor<unknown> = {
								get() {
									return entryCopy[fieldName];
								},
								update(newData: unknown) {
									entryCopy[fieldName] = newData;
								}
							};

							// logger.trace(`Processing entry ${index + 1}/${data.length} for field: ${fieldName}`);
							try {
								// Call widget.modifyRequest with structural casts to avoid `any` while remaining permissive
								const modify = modifyFn as (args: Record<string, unknown>) => Promise<unknown> | unknown;
								await modify({
									collection: collection as unknown as Record<string, unknown>,
									field: field as unknown as Record<string, unknown>,
									data: dataAccessor as unknown as Record<string, unknown>,
									user: user as unknown as Record<string, unknown>,
									type: type as unknown as string,
									tenantId: tenantId as unknown as string | undefined,
									collectionName: collectionName as unknown as string | undefined,
									id: entryCopy._id,
									meta_data: entryCopy.meta_data
								});

								// const entryDuration = performance.now() - entryStart;
								// logger.debug(`Entry ${index + 1} processed in ${entryDuration.toFixed(2)}ms`);
							} catch (widgetError) {
								const errorMessage = widgetError instanceof Error ? widgetError.message : 'Unknown widget error';
								const errorStack = widgetError instanceof Error ? widgetError.stack : '';
								logger.error(`Widget error for field ${fieldName}, entry ${index + 1}: ${errorMessage}`, { stack: errorStack });
							}

							return entryCopy;
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : 'Unknown error';
							const errorStack = error instanceof Error ? error.stack : '';
							logger.error(`Error processing entry ${index + 1}: ${errorMessage}`, {
								stack: errorStack
							});
							return entry;
						}
					})
				);

				const fieldDuration = performance.now() - fieldStart;
				logger.trace(`Field ${fieldName} processed in ${fieldDuration.toFixed(2)}ms`);
			} else {
				// logger.warn(`Nomodify-requesthandler for widget: ${field.widget.Name}`);
			}
		}

		const duration = performance.now() - start;
		logger.info(`ModifyRequest completed in ${duration.toFixed(2)}ms for ${data.length} entries`);

		return data;
	} catch (error) {
		const duration = performance.now() - start;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`ModifyRequest failed after ${duration.toFixed(2)}ms: ${errorMessage}`, {
			stack: errorStack
		});
		throw error;
	}
}
