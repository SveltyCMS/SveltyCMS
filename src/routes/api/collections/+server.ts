/**
 * @file src/routes/api/collections/+server.ts
 * @description API endpoint for listing all available collections
 *
 * @example: GET /api/collections
 *
 * Features:
 * * Lists all collections accessible to the current user within their tenant
 * * Filters collections based on user permissions
 * * Provides collection metadata and configuration
 * * Replaces /api/getCollections endpoint
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// Auth
import { contentManager } from '@src/content/ContentManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// GET: Lists all collections accessible to the user
export const GET: RequestHandler = async ({ locals, url }) => {
	const start = performance.now();
	const { tenantId } = locals; // User is guaranteed to exist due to hooks protection

	// In multi-tenant mode, a tenantId is required.
	if (privateEnv.MULTI_TENANT && !tenantId) {
		logger.error('List collections attempt failed: Tenant ID is missing in a multi-tenant setup.');
		throw error(400, 'Could not identify the tenant for this request.');
	}

	try {
		// Get query parameters
		const includeFields = url.searchParams.get('includeFields') === 'true';
		const includeStats = url.searchParams.get('includeStats') === 'true'; // Get all collections from ContentManager, scoped by tenantId

		const { collections: allCollections } = await contentManager.getCollectionData(tenantId);

		const accessibleCollections = []; // All collections are accessible since hooks handle authorization

		for (const [collectionId, collection] of Object.entries(allCollections)) {
			const collectionInfo = {
				id: collection._id,
				name: collection.name,
				label: collection.label || collection.name,
				description: collection.description,
				icon: collection.icon,
				path: collection.path,
				permissions: {
					read: true, // User already authorized by hooks
					write: true // User already authorized by hooks
				}
			};

			// Include fields if requested
			if (includeFields) {
				collectionInfo.fields = collection.fields;
			}

			// Include stats if requested (user already authorized by hooks)
			if (includeStats) {
				try {
					// You can add collection statistics here if your DB adapter supports it
					// For now, just add placeholder
					collectionInfo.stats = {
						totalEntries: 0,
						publishedEntries: 0,
						draftEntries: 0
					};
				} catch (statsError) {
					logger.warn(`Failed to get stats for collection ${collectionId}: ${statsError.message}`);
				}
			}

			accessibleCollections.push(collectionInfo);
		}

		const duration = performance.now() - start;
		logger.info(`${accessibleCollections.length} collections retrieved in ${duration.toFixed(2)}ms for tenant ${tenantId}`);

		return json({
			success: true,
			data: {
				collections: accessibleCollections,
				total: accessibleCollections.length
			},
			performance: { duration }
		});
	} catch (e) {
		const duration = performance.now() - start;
		logger.error(`Failed to get collections: ${e.message} in ${duration.toFixed(2)}ms`);
		throw error(500, 'Internal Server Error');
	}
};
