/**
 * @file src/routes/api/index/search/+server.ts
 * @description API endpoint for searching across collections
 *
 * This module handles searching across all collections:
 * - Performs full-text search across multiple collections
 * - Supports pagination and filtering
 * - Uses database-agnostic interface
 *
 * Features:
 * - Cross-collection search
 * - Pagination support
 * - Permission checking
 * - Enhanced error handling
 */

import { dbAdapter, dbInitPromise } from '@src/databases/db';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { checkUserPermission } from '@src/auth/permissionCheck';
import { logger } from '@utils/logger.svelte';
import { getAllPermissions } from '@src/auth/permissionManager';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Wait for database initialization
		await dbInitPromise;

		// Get database adapter
		if (!dbAdapter) {
			throw error(500, 'Database adapter not initialized');
		}
		const collections = await dbAdapter.getCollectionModels();

		// Parse request body
		const body = await request.json();
		const { query, page = 1, limit = 10 } = body;

		// Validate query
		if (!query || typeof query !== 'string') {
			logger.warn('Invalid search query');
			throw error(400, 'Invalid search query');
		}

		// Check API permissions
		const permissions = await getAllPermissions();
		const requiredPermission = permissions.find((p) => p._id === 'api:search');

		if (requiredPermission) {
			const { hasPermission } = await checkUserPermission(locals.user, {
				contextId: 'api:search',
				name: 'Access Search API',
				action: requiredPermission.action,
				contextType: requiredPermission.type
			});

			if (!hasPermission) {
				logger.warn(`User ${locals.user?._id} attempted to access search API without permission`);
				throw error(403, 'Forbidden: Insufficient permissions');
			}
		}

		// Perform search across all collections
		const results = [];
		const skip = (page - 1) * limit;

		for (const [collectionName, collection] of collections) {
			// Check collection-specific permissions
			const collectionPermission = permissions.find((p) => p._id === `collection:${collectionName}:read`);

			if (collectionPermission) {
				const { hasPermission } = await checkUserPermission(locals.user, {
					contextId: `collection:${collectionName}`,
					name: `Read ${collectionName} Collection`,
					action: collectionPermission.action,
					contextType: collectionPermission.type
				});

				if (!hasPermission) {
					continue;
				}
			}

			// Perform search on collection
			const searchResults = await collection.search({
				query,
				skip,
				limit
			});

			if (searchResults.length > 0) {
				results.push({
					collection: collectionName,
					results: searchResults
				});
			}
		}

		return new Response(
			JSON.stringify({
				results,
				page,
				limit,
				total: results.reduce((acc, curr) => acc + curr.results.length, 0)
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		logger.error('Search error:', { error: message });
		throw error(500, `Search failed: ${message}`);
	}
};
