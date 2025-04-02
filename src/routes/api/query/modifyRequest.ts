/**
 * @file src/routes/api/query/modifyRequest.ts
 * @description Utility function for modifying request data based on field widgets.
 *
 * This module provides functionality to:
 * - Process each field in a collection schema
 * - Apply widget-specific modifications to the request data
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
 * Called by various query handlers (GET, POST, etc.) to modify request data
 * before final processing or database operations.
 */

import widgets from '@widgets';
import { getFieldName } from '@utils/utils';

// Types
import type { User } from '@src/auth/types';
import type { CollectionModel } from '@src/databases/dbInterface';

// System logger
import { logger } from '@utils/logger.svelte';
import type { Field } from '@root/src/content/types';

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
	fields: Field[];
	collection: CollectionModel;
	user: User;
	type: string;
}

// Function to modify request data based on field widgets
export async function modifyRequest({ data, fields, collection, user, type }: ModifyRequestParams) {
	const start = performance.now();
	try {
		logger.debug(
			`Starting modifyRequest for type: \x1b[34m${type}\x1b[0m, user: \x1b[34m${user._id}\x1b[0m, collection: \x1b[34m${collection.id}\x1b[0m`
		);

		for (const field of fields) {
			const fieldStart = performance.now();

			// Ensure field.widget exists before accessing its properties
			if (!field.widget || !field.widget.Name) {
				logger.warn(`Field '${field.label || field.db_fieldName || JSON.stringify(field)}' is missing widget information. Skipping modifyRequest.`);
				continue; // Skip this field if widget info is missing
			}
			const widget = widgets[field.widget.Name];
			if (!widget) {
				logger.warn(`Widget '${field.widget.Name}' not found in loaded widgets for field '${field.label || field.db_fieldName}'. Skipping modifyRequest.`);
				continue; // Skip if the widget function itself isn't found
			}

			const fieldName = getFieldName(field);

			logger.debug(`Processing field: \x1b[34m${fieldName}\x1b[0m, widget: \x1b[34m${field.widget.Name}\x1b[0m`);

			// Check if widget has modifyRequest handler safely
			if (widget && typeof widget === 'function' && 'modifyRequest' in widget && typeof widget.modifyRequest === 'function') {
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

							logger.debug(`Processing entry ${index + 1}/${data.length} for field: ${fieldName}`);

							try {
								await widget.modifyRequest({
									collection,
									field,
									data: dataAccessor,
									user,
									type,
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
							logger.error(`Error processing entry ${index + 1}: ${errorMessage}`, { stack: errorStack });
							return entry;
						}
					})
				);

				const fieldDuration = performance.now() - fieldStart;
				logger.debug(`Field ${fieldName} processed in ${fieldDuration.toFixed(2)}ms`);
			} else if (field.widget.Name) { // Only log warning if widget name was present but handler wasn't
				logger.warn(`No modifyRequest handler for widget: \x1b[34m${field.widget.Name}\x1b[0m`);
			}
		}

		const duration = performance.now() - start;
		logger.info(`ModifyRequest completed in ${duration.toFixed(2)}ms for ${data.length} entries`);

		return data;
	} catch (error) {
		const duration = performance.now() - start;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`ModifyRequest failed after ${duration.toFixed(2)}ms: ${errorMessage}`, { stack: errorStack });
		throw error;
	}
}
