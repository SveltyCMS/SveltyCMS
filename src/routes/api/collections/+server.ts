/**
 * @file src/routes/api/collections/+server.ts
 * @description API endpoint for listing all available collections
 *
 * @example: GET /api/collections
 *
 * Features:
 *    * Lists all collections accessible to the current user
 *    * Filters collections based on user permissions
 *    * Provides collection metadata and configuration
 *    * Replaces /api/getCollections endpoint
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { hasCollectionPermission } from '@api/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// GET: Lists all collections accessible to the user
export const GET: RequestHandler = async ({ locals, url }) => {
	const start = performance.now();

	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Get query parameters
		const includeFields = url.searchParams.get('includeFields') === 'true';
		const includeStats = url.searchParams.get('includeStats') === 'true';

		// Get all collections from ContentManager
		const { collectionMap } = await contentManager.getCollectionData();

		const accessibleCollections = [];

		// Filter collections based on user permissions
		if (collectionMap) {
			for (const [collectionId, collection] of Object.entries(collectionMap)) {
				const hasReadAccess = hasCollectionPermission(locals.user, 'read', collection);
				const hasWriteAccess = hasCollectionPermission(locals.user, 'write', collection);

				if (hasReadAccess || hasWriteAccess) {
					const collectionInfo = {
						id: collection._id,
						name: collection.name,
						label: collection.label || collection.name,
						description: collection.description,
						icon: collection.icon,
						path: collection.path,
						permissions: {
							read: hasReadAccess,
							write: hasWriteAccess
						}
					};

					// Include fields if requested
					if (includeFields) {
						collectionInfo.fields = collection.fields;
					}

					// Include stats if requested and user has read access
					if (includeStats && hasReadAccess) {
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
			}
		}

		const duration = performance.now() - start;
		logger.info(`${accessibleCollections.length} collections retrieved in ${duration.toFixed(2)}ms`);

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
