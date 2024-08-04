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
 * - Aggregation pipeline for complex queries
 * - Total count and pages count calculation
 * - Content language handling
 * - Error handling and logging
 *
 * Usage:
 * Called by the main query handler for GET operations
 * Accepts parameters for schema, user, sorting, filtering, content language, and pagination
 *
 * Note: This handler assumes that user authentication and authorization
 * have already been performed by the calling function.
 */

import { publicEnv } from '@root/config/public';

// Types
import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

import { dbAdapter, getCollectionModels } from '@src/databases/db';
import { modifyRequest } from './modifyRequest';
import widgets from '@src/components/widgets';
import { getFieldName, get_elements_by_id } from '@src/utils/utils';

// System Logger
import logger from '@src/utils/logger';

// Function to handle GET requests for a specified collection
export async function _GET({
	schema,
	sort = {},
	filter = {},
	contentLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE,
	user,
	limit = 0,
	page = 1
}: {
	schema: Schema;
	user: User;
	sort?: { [key: string]: number };
	filter?: { [key: string]: string };
	contentLanguage?: string;
	limit?: number;
	page?: number;
}) {
	try {
		logger.debug(`GET request received for schema: ${schema.name}, user_id: ${user._id}`);

		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', { status: 500 });
		}

		const aggregations: any[] = [];
		const collections = await getCollectionModels(); // Get collection models from the database
		logger.debug(`Collection models retrieved: ${Object.keys(collections).join(', ')}`);

		const collection = collections[schema.name as string]; // Get the specific collection based on the schema name
		const skip = (page - 1) * limit; // Calculate the number of documents to skip for pagination

		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found', { status: 404 });
		}

		// Build aggregation pipelines for sorting and filtering
		for (const field of schema.fields) {
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);
			if ('aggregations' in widget) {
				const _filter = filter[fieldName];
				const _sort = sort[fieldName];

				if (widget.aggregations?.filters && _filter) {
					const _aggregations = await widget.aggregations.filters({
						field,
						contentLanguage,
						filter: _filter
					});
					aggregations.push(..._aggregations);
				}
				if (widget.aggregations?.sorts && _sort) {
					const _aggregations = await widget.aggregations.sorts({
						field,
						contentLanguage,
						sort: _sort
					});
					aggregations.push(..._aggregations);
				}
			}
		}

		// Execute the aggregation pipeline
		const [{ entries, totalCount }] = await collection.aggregate([
			{
				$facet: {
					entries: [...aggregations, { $skip: skip }, ...(limit ? [{ $limit: limit }] : [])],
					totalCount: [...aggregations, { $count: 'total' }]
				}
			}
		]);

		// Modify request with the retrieved entries
		await modifyRequest({
			data: entries,
			collection,
			fields: schema.fields,
			user,
			type: 'GET'
		});
		logger.debug(`Request modified for ${entries.length} entries`);

		// Get all collected IDs and modify request
		await get_elements_by_id.getAll(dbAdapter);

		// Calculate total count and pages count
		const total = totalCount[0]?.total ?? 0;
		const pagesCount = limit > 0 ? Math.ceil(total / limit) : 1;

		logger.info(`GET request completed. Total count: ${total}, Pages count: ${pagesCount}`);

		// Return the response with entry list and pages count
		return new Response(JSON.stringify({ entryList: entries, pagesCount }), { headers: { 'Content-Type': 'application/json' } });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error(`Error occurred during GET request: ${errorMessage}`);
		return new Response(errorMessage, { status: 500 });
	}
}
