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
		logger.debug(`GET request received for schema: \x1b[34m${schema._id}\x1b[0m, user_id: \x1b[34m${user._id}\x1b[0m`);

		// Ensure the database adapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', {
				status: 500
			});
		}

		// Validate schema ID
		if (!schema._id) {
			logger.error(`Invalid or undefined schema ID: \x1b[34m${schema._id}\x1b[0m`);
			return new Response('Invalid or undefined schema ID.', { status: 400 });
		}

		// Get collection models
		const collection = dbAdapter.collection.getModel(schema._id);

		// Find the collection by name or ID
		if (!collection) {
			logger.error(`Collection not found for schema ID: \x1b[34m${schema._id}\x1b[0m or name: \x1b[34m${schema.name}\x1b[0m`);
			return new Response('Collection not found', { status: 404 });
		}

		const aggregations: AggregationPipeline[] = [];

		// Add status filter based on user permissions
		const isAdmin = user?.permissions?.includes('admin');
		if (!isAdmin) {
			aggregations.push({
				$match: {
					status: 'published'
				}
			});
		} else {
			logger.info(`Admin user \x1b[34m${user._id}\x1b[0m accessing collection \x1b[34m${schema._id}\x1b[0m with full status visibility`);
		}
		const skip = (page - 1) * limit; // Calculate the number of documents to skip for pagination

		// Build aggregation pipelines for sorting and filtering
		for (const field of schema.fields) {
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);
			if ('aggregations' in widget) {
				const _filter = filter[fieldName];
				const _sort = sort[fieldName];

				if (widget.aggregations?.filters && _filter) {
					try {
						const _aggregations = await widget.aggregations.filters({
							field,
							contentLanguage,
							filter: _filter
						});
						aggregations.push(..._aggregations);
					} catch (error) {
						logger.error(`Error in widget filter aggregation for field ${fieldName} after ${duration.toFixed(2)}ms: ${error}`);
					}
				}
				if (widget.aggregations?.sorts && _sort) {
					try {
						const _aggregations = await widget.aggregations.sorts({
							field,
							contentLanguage,
							sort: _sort
						});
						aggregations.push(..._aggregations);
					} catch (error) {
						logger.error(`Error in widget sort aggregation for field ${fieldName}: ${error}`);
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

			const duration = performance.now() - start;

			logger.debug(
				`Queries executed in \x1b[33m${duration.toFixed(2)}ms\x1b[0m. Entries: \x1b[34m${entries.length}\x1b[0m, Total: \x1b[34m${total}\x1b[0m`
			);
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
			logger.debug(`Request modified for \x1b[34m${entries.length}\x1b[0m entries`);
		} catch (error) {
			logger.error(`Error in modifyRequest: ${error}`);
		}

		// Get all collected IDs and modify request
		try {
			await get_elements_by_id.getAll(dbAdapter);
		} catch (error) {
			logger.error(`Error in get_elements_by_id.getAll: ${error}`);
		}

		// Calculate pages count
		const pagesCount = limit > 0 ? Math.ceil(total / limit) : 1;

		const duration = performance.now() - start;
		logger.info(
			`GET request completed in \x1b[33m${duration.toFixed(2)}ms\x1b[0m. Total: \x1b[34m${total}\x1b[0m, Pages: \x1b[34m${pagesCount}\x1b[0m`
		);

		// Return the response with entry list and pages count
		return new Response(
			JSON.stringify({
				success: true,
				entryList: entries,
				pagesCount,
				totalItems: total,
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

		// Enhanced error logging
		logger.error(`Error in GET request after \x1b[33m${duration.toFixed(2)}ms\x1b[0m`, {
			error: errorMessage,
			stack: errorStack,
			schema: schema?._id,
			user: user?._id,
			contentLanguage,
			duration
		});

		// Standardized error response
		const errorResponse = {
			success: false,
			error: {
				message: errorMessage,
				code: 'SERVER_ERROR',
				details: process.env.NODE_ENV === 'development' ? errorStack : undefined
			},
			performance: {
				total: duration
			}
		};

		return new Response(JSON.stringify(errorResponse), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	}
}
