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
 * - Detailed logging for debugging purposes
 *
 * Usage:
 * Called by various query handlers (GET, POST, etc.) to modify request data
 * before final processing or database operations.
 *
 * Note: This function assumes that the widgets have a 'modifyRequest' method
 * if they need to perform custom modifications.
 */

import widgets from '@src/components/widgets';
import { getFieldName } from '@src/utils/utils';

// Types
import type { User } from '@src/auth/types';
import type { CollectionModel } from '@src/databases/dbInterface';

// System logger
import logger from '@src/utils/logger';

// Define Field type locally if not available in @src/collections/types
interface Field {
	widget: {
		Name: string;
	};
}

// Define the parameters for the function
interface ModifyRequestParams {
	data: any[];
	fields: Field[];
	collection: CollectionModel;
	user: User;
	type: string;
}

// Function to modify request data based on field widgets
export async function modifyRequest({ data, fields, collection, user, type }: ModifyRequestParams) {
	try {
		logger.debug(`Starting modifyRequest for type: ${type}, user: ${user._id}, collection: ${collection.modelName}`);

		for (const field of fields) {
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);

			logger.debug(`Processing field: ${fieldName}, widget: ${field.widget.Name}`);

			if ('modifyRequest' in widget) {
				// Widget can modify its own portion of entryList
				data = await Promise.all(
					data.map(async (entry: any) => {
						const dataAccessor = {
							get() {
								return entry[fieldName];
							},
							update(newData: any) {
								entry[fieldName] = newData;
							}
						};

						logger.debug(`Modifying entry with ID: ${entry._id}, field: ${fieldName}`);

						await widget.modifyRequest({
							collection,
							field,
							data: dataAccessor,
							user,
							type,
							id: entry._id,
							meta_data: entry.meta_data
						});

						return entry;
					})
				);
			}
		}

		logger.debug(`ModifyRequest completed for ${data.length} entries`);
		return data; // Return the modified data
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error('Error in modifyRequest:', { error: errorMessage });
		throw new Error(`ModifyRequest failed: ${errorMessage}`);
	}
}
