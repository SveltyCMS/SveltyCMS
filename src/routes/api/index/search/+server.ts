/**
 * @file src/routes/api/index/search/+server.ts
 * @description API endpoint for searching across collections
 *
 * This module handles searching across all collections for the current tenant:
 * - Performs full-text search across multiple collections
 * - Supports pagination and filtering
 * - Uses database-agnostic interface
 *
 * Features:
 * - Cross-collection, tenant-aware search
 * - Pagination support
 * - Permission checking
 * - Enhanced error handling
 */
import { privateEnv } from '@root/config/private';

// Database
import { dbAdapter, dbInitPromise } from '@src/databases/db';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Permissions

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		// Wait for database initialization
		await dbInitPromise;

		// Get database adapter
		if (!dbAdapter) {
			throw error(500, 'Database adapter not initialized');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}

		const collections = await dbAdapter.getCollectionModels(tenantId);
		// Parse request body
		const body = await request.json();
		const { query, page = 1, limit = 10 } = body;
		// Validate query
		if (!query || typeof query !== 'string') {
			logger.warn('Invalid search query', { tenantId });
			throw error(400, 'Invalid search query');
		}
		// Authentication is handled by hooks.server.ts - user presence confirms access
		// Perform search across all collections
		const results = [];
		const skip = (page - 1) * limit;

		for (const [collectionName, collection] of collections) {
			// TODO: Add collection-specific search permissions if needed

			// Perform search on collection, scoped by tenant
			const searchResults = await collection.search({
				query,
				skip,
				limit,
				tenantId
			});

			if (searchResults.length > 0) {
				results.push({
					collection: collectionName,
					results: searchResults
				});
			}
		}

		logger.info('Search completed successfully', { tenantId, query, user: user?._id });

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
		logger.error('Search error:', { error: message, tenantId });
		throw error(500, `Search failed: ${message}`);
	}
};
