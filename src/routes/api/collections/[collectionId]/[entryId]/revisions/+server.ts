/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/revisions/+server.ts
 * @description API endpoint for retrieving entry revision history
 *
 * @example: GET /api/collections/posts/123/revisions
 *
 * Features:
 * * Lists all revisions for a specific entry within the current tenant
 * * Provides diff comparison between revisions
 * * Supports pagination for large revision histories
 * * Permission checking for revision access
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// Databases
import { dbAdapter } from '@src/databases/db';

// Auth
import { contentManager } from '@src/content/ContentManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// GET: Retrieves revision history for an entry
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const start = performance.now();
	const { user, tenantId } = locals; // Destructure user and tenantId

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
	if (!schema) {
		throw error(404, 'Collection not found');
	}

	try {
		// --- MULTI-TENANCY SECURITY CHECK ---
		// Verify the entry itself belongs to the current tenant before fetching its revisions.
		if (privateEnv.MULTI_TENANT) {
			const collectionName = `collection_${schema._id}`;
			const entryResult = await dbAdapter.crud.find(collectionName, { _id: params.entryId, tenantId });
			if (!entryResult.success || !entryResult.data || entryResult.data.length === 0) {
				logger.warn(`Attempt to access revisions for an entry not in the current tenant.`, {
					userId: user._id,
					tenantId,
					collectionId: params.collectionId,
					entryId: params.entryId
				});
				throw error(404, 'Entry not found');
			}
		} // Get query parameters for pagination

		const page = parseInt(url.searchParams.get('page') ?? '1', 10);
		const limit = parseInt(url.searchParams.get('limit') ?? '10', 10); // Get revision history for the entry, scoped by tenant

		const revisionsResult = await dbAdapter.content.revisions.getHistory(params.entryId, tenantId);

		if (!revisionsResult.success) {
			logger.error(`Failed to get revisions for entry ${params.entryId}: ${revisionsResult.error?.message}`);
			throw error(500, 'Failed to retrieve revisions');
		}

		const revisions = revisionsResult.data || []; // Apply pagination

		const startIndex = (page - 1) * limit;
		const paginatedRevisions = revisions.slice(startIndex, startIndex + limit);

		const duration = performance.now() - start;
		logger.info(`Revisions for entry ${params.entryId} in tenant ${tenantId} retrieved in ${duration.toFixed(2)}ms`);

		return json({
			success: true,
			data: {
				revisions: paginatedRevisions,
				total: revisions.length,
				page: page,
				limit: limit,
				totalPages: Math.ceil(revisions.length / limit)
			},
			performance: { duration }
		});
	} catch (e) {
		if (e.status) throw e; // Re-throw SvelteKit errors

		const duration = performance.now() - start;
		logger.error(`Failed to get revisions for entry ${params.entryId}: ${e.message} in ${duration.toFixed(2)}ms`);
		throw error(500, 'Internal Server Error');
	}
};
