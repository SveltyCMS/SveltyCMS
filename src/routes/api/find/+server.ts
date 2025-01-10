/**
 * @file src/routes/api/find/+server.ts
 * @description API endpoint for finding documents in collections.
 *
 * This module handles finding documents in collections:
 * - Retrieves documents by ID or query
 * - Supports all collections in the collectionsModels
 *
 * Features:
 * - Single document retrieval by ID
 * - Multiple document retrieval by query with pagination
 * - Enhanced error logging and handling
 * - Initialization check to ensure database is ready
 *
 * Usage:
 * GET /api/find?collection=<contentTypes>&id=<documentId>
 * GET /api/find?collection=<contentTypes>&query=<jsonQuery>&page=<page>&limit=<limit>
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { dbAdapter, dbInitPromise } from '@src/databases/db';
import { validateUserPermission } from '@src/auth/permissionManager';
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
	const contentTypes = url.searchParams.get('collection');
	const id = url.searchParams.get('id');
	const queryParam = url.searchParams.get('query');

	logger.debug(`API Find request - Collection: ${contentTypes}, ID: ${id}, Query: ${queryParam}`);

	try {
		// Wait for initialization to complete
		await dbInitPromise;

		// Check if the collection name is provided
		if (!contentTypes) {
			logger.warn('Collection name not provided');
			throw error(400, 'Collection name is required');
		}

		// Get database adapter
		if (!dbAdapter) {
			throw error(500, 'Database adapter not initialized');
		}
		const collections = await dbAdapter.getCollectionModels();

		// Validate that the collection exists
		const collection = collections.get(contentTypes);
		if (!collection) {
			logger.error(`Collection not found: ${contentTypes}`);
			throw error(404, `Collection not found: ${contentTypes}`);
		}

		// Check permissions
		const requiredPermission = `${contentTypes}:read`;
		if (!validateUserPermission(locals.permissions, requiredPermission)) {
			logger.warn(`User lacks required permission: ${requiredPermission}`);
			throw error(403, `Forbidden: Insufficient permissions for ${requiredPermission}`);
		}

		let result;

		// If an ID is provided, find the document by ID
		if (id) {
			result = await collection.findOne({ _id: id });
			if (!result) {
				logger.warn(`Document not found with ID: ${id} in collection: ${contentTypes}`);
				throw error(404, `Document not found with ID: ${id} in collection: ${contentTypes}`);
			}
		} else if (queryParam) {
			// If a query is provided, find documents that match the query
			const query = JSON.parse(queryParam);
			const page = parseInt(query.page, 10) || 1;
			const limit = parseInt(query.limit, 10) || 10;
			const skip = (page - 1) * limit;

			const [documents, total] = await Promise.all([
				collection.find(query).skip(skip).limit(limit),
				collection.countDocuments(query)
			]);

			result = {
				documents,
				total,
				page,
				pages: Math.ceil(total / limit)
			};
		} else {
			logger.warn('Neither ID nor query provided');
			throw error(400, 'Either id or query parameter is required');
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		logger.error('Error in API Find operation:', { error: message });
		throw error(500, `Failed to retrieve documents: ${message}`);
	}
};
