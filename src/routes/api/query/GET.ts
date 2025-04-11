/**
 * @file src/routes/api/query/GET.ts
 * @description Handler for GET operations on collections.
 *
 * This module provides functionality to:
 * - Retrieve documents from a specified collection
 * - Apply sorting, filtering, and pagination
 * - Handle custom widget aggregations
 * - Perform post-retrieval modifications via modifyRequest
 *
 * Features:
 * - Support for custom widget-based filtering and sorting
 * - Pagination with skip and limit
 * - Optimized queries for better database compatibility
 * - Total count and pages count calculation
 * - Content language handling
 * - Error handling and logging
 */

// Types
import type { Schema } from '@root/src/content/types';
import type { User } from '@src/auth/types';

// Interface for database aggregation operations
export interface AggregationPipeline {
	$match?: Record<string, unknown>;
	$sort?: Record<string, number>;
	$skip?: number;
	$limit?: number;
	[key: string]: unknown;
}

// Database
import { dbAdapter } from '@src/databases/db';

// Utils
import { modifyRequest } from '@src/routes/api/query/modifyRequest';
import widgets from '@widgets';
import { getFieldName, get_elements_by_id } from '@utils/utils';

// System Logger
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@root/src/content/ContentManager';

// Function to handle GET requests for a specified collection
export async function _GET({
	schema,
	sort = {},
	filter = {},
	contentLanguage,
	user,
	limit = 0,
	page = 1
}: {
	schema: Schema;
	user: User;
	sort?: { [key: string]: number };
	filter?: { [key: string]: string };
	contentLanguage: string;
	limit?: number;
	page?: number;
}) {
	const start = performance.now();
	try {
		logger.debug(`GET request received for schema: ${schema._id}, user_id: ${user._id}`);

		// Ensure the database adapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', { status: 500 });
		}

		// Validate schema ID
		if (!schema._id) {
			logger.error(`Invalid or undefined schema ID: ${schema._id}`);
			return new Response('Invalid or undefined schema ID.', { status: 400 });
		}

		// Get collection models
		const collection = contentManager.getCollectionModelById(schema._id);

		// Find the collection by name or ID
		if (!collection) {
			logger.error(`Collection not found for schema ID: ${schema._id} or name: ${schema.name}`);
			return new Response('Collection not found', { status: 404 });
		}

		const aggregations: AggregationPipeline[] = [];
		const skip = (page - 1) * limit; // Calculate the number of documents to skip for pagination

		// Build aggregation pipelines for sorting and filtering
		for (const field of schema.fields) {
			// Ensure field.widget exists before accessing its properties
			if (!field.widget || !field.widget.Name) {
				logger.warn(`Field '${field.label || field.db_fieldName || JSON.stringify(field)}' is missing widget information. Skipping aggregation.`);
				continue; // Skip this field if widget info is missing
			}
			const widget = widgets[field.widget.Name];
			if (!widget) {
				logger.warn(
					`Widget '${field.widget.Name}' not found in loaded widgets for field '${field.label || field.db_fieldName}'. Skipping aggregation.`
				);
				continue; // Skip if the widget function itself isn't found
			}

			const fieldName = getFieldName(field);
			// Check if widget has aggregations property safely
			if (widget && typeof widget === 'function' && 'aggregations' in widget && widget.aggregations) {
				const _filter = filter[fieldName];
				const _sort = sort[fieldName];

				// Safely access aggregations.filters
				if (widget.aggregations.filters && typeof widget.aggregations.filters === 'function' && _filter) {
					try {
						const _aggregations = await widget.aggregations.filters({
							field, // Pass the whole field object
							contentLanguage, // Add contentLanguage back
							filter: _filter // Add filter back
						});
						aggregations.push(..._aggregations);
					} catch (error) {
						logger.error(`Error in widget filter aggregation for field ${fieldName}: ${error instanceof Error ? error.message : error}`);
					}
				}
				// Safely access aggregations.sorts
				if (widget.aggregations.sorts && typeof widget.aggregations.sorts === 'function' && _sort) {
					try {
						const _aggregations = await widget.aggregations.sorts({
							field, // Pass the whole field object
							contentLanguage, // Add contentLanguage back
							sort: _sort // Add sort back
						});
						aggregations.push(..._aggregations);
					} catch (error) {
						logger.error(`Error in widget sort aggregation for field ${fieldName}: ${error instanceof Error ? error.message : error}`);
					}
				}
			}
		}

		// Execute queries separately for better compatibility
		let entries = [],
			total = 0;
		try {
			// Get total count first
			const countResult = await collection.aggregate([...aggregations, { $count: 'total' }]);
			total = countResult[0]?.total ?? 0;

			// Then get paginated entries
			entries = await collection.aggregate([...aggregations, { $skip: skip }, ...(limit ? [{ $limit: limit }] : [])]);

			const queryDuration = performance.now() - start;
			logger.debug(`Queries executed in ${queryDuration.toFixed(2)}ms. Entries: ${entries.length}, Total: ${total}`);
		} catch (error) {
			logger.error(`Error executing queries: ${error}`);
			return new Response('Error executing database query', { status: 500 });
		}

		// Modify request with the retrieved entries
		try {
			await modifyRequest({
				data: entries,
				collection,
				fields: schema.fields,
				user,
				type: 'GET'
			});
			logger.debug(`Request modified for ${entries.length} entries`);
		} catch (error) {
			logger.error(`Error in modifyRequest: ${error}`);
		}

		// Get all collected IDs and modify request
		try {
			await get_elements_by_id.getAll(dbAdapter);
			logger.debug('get_elements_by_id.getAll executed successfully');
		} catch (error) {
			logger.error(`Error in get_elements_by_id.getAll: ${error}`);
		}

		// Calculate pages count
		const pagesCount = limit > 0 ? Math.ceil(total / limit) : 1;

		const duration = performance.now() - start;
		logger.info(`GET request completed in ${duration.toFixed(2)}ms. Total: ${total}, Pages: ${pagesCount}`);

		// Return the response with entry list and pages count
		return new Response(
			JSON.stringify({
				success: true,
				entryList: entries,
				pagesCount,
				performance: {
					total: duration
				}
			}),
			{
				headers: {
					'Content-Type': 'application/json',
					'X-Content-Type-Options': 'nosniff'
				}
			}
		);
	} catch (error) {
		const duration = performance.now() - start;
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`Error in GET request after ${duration.toFixed(2)}ms: ${errorMessage}`, { stack: errorStack });
		return new Response(
			JSON.stringify({
				success: false,
				error: errorMessage,
				performance: {
					total: duration
				}
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'X-Content-Type-Options': 'nosniff'
				}
			}
		);
	}
}
