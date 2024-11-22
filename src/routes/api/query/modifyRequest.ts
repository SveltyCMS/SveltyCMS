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
 * - Performance monitoring with visual indicators
 * - Detailed logging for debugging purposes
 *
 * Usage:
 * Called by various query handlers (GET, POST, etc.) to modify request data
 * before final processing or database operations.
 */

import widgets from '@components/widgets';
import { getFieldName } from '@utils/utils';

// Types
import type { User } from '@src/auth/types';
import type { CollectionModel } from '@src/databases/dbInterface';

// System logger
import { logger } from '@utils/logger';

// Define Field type locally if not available in @src/collections/types
interface Field {
	widget: {
		Name: string;
	};
}

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

// Performance monitoring utilities
const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 100) return '🚀'; // Super fast
	if (responseTime < 500) return '⚡'; // Fast
	if (responseTime < 1000) return '⏱️'; // Moderate
	if (responseTime < 3000) return '🕰️'; // Slow
	return '🐢'; // Very slow
};

// Function to modify request data based on field widgets
export async function modifyRequest({ data, fields, collection, user, type }: ModifyRequestParams) {
	const start = performance.now();
	try {
		logger.debug(`Starting modifyRequest for type: ${type}, user: ${user._id}, collection: ${collection.modelName}`);

		for (const field of fields) {
			const fieldStart = performance.now();
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);

			logger.debug(`Processing field: ${fieldName}, widget: ${field.widget.Name}`);

			if (widget && 'modifyRequest' in widget) {
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
								const entryEmoji = getPerformanceEmoji(entryDuration);
								logger.debug(`Entry ${index + 1} processed in ${entryDuration.toFixed(2)}ms ${entryEmoji}`);
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
				const fieldEmoji = getPerformanceEmoji(fieldDuration);
				logger.debug(`Field ${fieldName} processed in ${fieldDuration.toFixed(2)}ms ${fieldEmoji}`);
			} else {
				logger.warn(`No modifyRequest handler for widget: ${field.widget.Name}`);
			}
		}

		const duration = performance.now() - start;
		const emoji = getPerformanceEmoji(duration);
		logger.info(`ModifyRequest completed in ${duration.toFixed(2)}ms ${emoji} for ${data.length} entries`);

		return data;
	} catch (error) {
		const duration = performance.now() - start;
		const emoji = getPerformanceEmoji(duration);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`ModifyRequest failed after ${duration.toFixed(2)}ms ${emoji}: ${errorMessage}`, { stack: errorStack });
		throw error;
	}
}
