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

import type { FieldInstance } from '@src/content/types';
// Types
import type { User } from '@src/databases/auth/types';
import type { CollectionModel } from '@src/databases/db-interface';
import { widgets } from '@src/stores/widget-store.svelte';
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
			// Access widget from store
			const widget = widgets.widgetFunctions[field.widget.Name];
			const fieldName = getFieldName(field);

			logger.trace(`Processing field: ${fieldName}, widget: ${field.widget.Name}`);

			// Resolve potential modify-request handler
			const modifyFn = widget?.modifyRequest;
			const modifyBatchFn = widget?.modifyRequestBatch;

			if (modifyBatchFn && typeof modifyBatchFn === 'function') {
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
						collectionName
					});

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
				}
			} else if (modifyFn && typeof modifyFn === 'function') {
				// --- INDIVIDUAL PROCESSING ---
				data = await Promise.all(
					data.map(async (entry: EntryData) => {
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

							try {
								await modifyFn({
									collection,
									field,
									data: dataAccessor,
									user,
									type,
									tenantId,
									collectionName
								});
							} catch (widgetError) {
								const errorMessage = widgetError instanceof Error ? widgetError.message : 'Unknown widget error';
								const errorStack = widgetError instanceof Error ? widgetError.stack : '';
								logger.error(`Widget error for field ${fieldName}: ${errorMessage}`, { stack: errorStack });
							}

							return entryCopy;
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : 'Unknown error';
							const errorStack = error instanceof Error ? error.stack : '';
							logger.error(`Error processing entry: ${errorMessage}`, {
								stack: errorStack
							});
							return entry;
						}
					})
				);

				const fieldDuration = performance.now() - fieldStart;
				logger.trace(`Field ${fieldName} processed in ${fieldDuration.toFixed(2)}ms`);
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
