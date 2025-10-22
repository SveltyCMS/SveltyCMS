/**
 * @file src/routes/api/collections/modifyRequest.ts
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

import { getFieldName } from '@utils/utils';
import { widgetFunctions as widgets } from '@stores/widgetStore.svelte';

// Types
import type { User } from '@src/databases/auth/types';
import type { FieldInstance } from '@src/content/types';
import type { CollectionModel } from '@src/databases/dbInterface';

// System logger
import { logger } from '@utils/logger.svelte';

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
	data: EntryData[];
	fields: FieldInstance[];
	collection: CollectionModel;
	user: User;
	type: string;
	tenantId?: string; // Add tenantId for multi-tenancy
}

// Function to modify request data based on field widgets
export async function modifyRequest({ data, fields, collection, user, type, tenantId }: ModifyRequestParams) {
	const start = performance.now();
	try {
		// User access is already validated by hooks
		logger.trace(
			`Starting modifyRequest for type: \x1b[34m${type}\x1b[0m, user: \x1b[34m${user._id}\x1b[0m, collection: \x1b[34m${(collection as unknown as { id?: string }).id ?? 'unknown'}\x1b[0m, tenant: \x1b[34m${tenantId}\x1b[0m`
		);

		for (const field of fields) {
			const fieldStart = performance.now();
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);

			logger.trace(`Processing field: \x1b[34m${fieldName}\x1b[0m, widget: \x1b[34m${field.widget.Name}\x1b[0m`);

			// Resolve potential modifyRequest handler in a type-safe way
			const modifyFn = (widget as unknown as { modifyRequest?: unknown })?.modifyRequest;
			if (modifyFn !== undefined && modifyFn !== null && typeof modifyFn === 'function') {
				data = await Promise.all(
					data.map(async (entry: EntryData, index: number) => {
						const entryStart = performance.now();
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

							logger.trace(`Processing entry ${index + 1}/${data.length} for field: ${fieldName}`);
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
									id: entryCopy._id,
									meta_data: entryCopy.meta_data
								});

								const entryDuration = performance.now() - entryStart;
								logger.debug(`Entry ${index + 1} processed in ${entryDuration.toFixed(2)}ms`);
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
				logger.trace(`Field \x1b[34m${fieldName}\x1b[0m processed in \x1b[33m${fieldDuration.toFixed(2)}ms\x1b[0m`);
			} else {
				logger.warn(`No modifyRequest handler for widget: \x1b[34m${field.widget.Name}\x1b[0m`);
			}
		}

		const duration = performance.now() - start;
		logger.info(`ModifyRequest completed in \x1b[33m${duration.toFixed(2)}ms\x1b[0m for \x1b[34m${data.length}\x1b[0m entries`);

		return data;
	} catch (error) {
		const duration = performance.now() - start;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`ModifyRequest failed after \x1b[33m${duration.toFixed(2)}ms\x1b[0m: ${errorMessage}`, {
			stack: errorStack
		});
		throw error;
	}
}
