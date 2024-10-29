/**
 * @file src/routes/api/collections/+server.ts
 * @description API endpoints for collection management
 *
 * Features:
 * - Collection data retrieval with Memory cache or optional Redis caching
 * - Collection structure updates
 * - Category management
 * - Type generation
 */

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { browser } from '$app/environment';

// Collection Manager
import { collectionManager } from '@src/collections/CollectionManager';

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';

// System Logger
import { logger } from '@src/utils/logger';

// Cache TTL
const CACHE_TTL = 300; // 5 minutes

export const GET: RequestHandler = async ({ url }) => {
	try {
		const action = url.searchParams.get('action');
		const name = url.searchParams.get('name');

		// Try to get from Redis cache first
		if (!browser && isRedisEnabled()) {
			const cacheKey = `api:collections:${action || 'default'}${name ? `:${name}` : ''}`;
			const cached = await getCache(cacheKey);
			if (cached) {
				logger.debug('Returning cached collection data', { action, name });
				return json(cached);
			}
		}

		const { collections, categories } = collectionManager.getCollectionData();
		let response;
		let collection;

		switch (action) {
			case 'structure':
				// Return full collection structure with categories
				logger.info('Returning collection structure');
				response = {
					success: true,
					data: { collections, categories }
				};
				break;

			case 'names':
				// Return just collection names
				logger.info('Returning collection names');
				response = collections.map((col) => col.name);
				break;

			case 'collection':
				// Return a specific collection
				if (!name) {
					throw error(400, 'Collection name is required');
				}

				collection = collections.find((c) => c.name === name);
				if (!collection) {
					throw error(404, 'Collection not found');
				}

				logger.info(`Returning collection: ${name}`);
				response = collection;
				break;

			default:
				// Default: return basic collection data
				logger.info('Returning basic collection data');
				response = {
					success: true,
					collections: collections.map(({ name, icon, path }) => ({
						name,
						icon,
						path
					}))
				};
		}

		// Cache in Redis if available
		if (!browser && isRedisEnabled()) {
			const cacheKey = `api:collections:${action || 'default'}${name ? `:${name}` : ''}`;
			await setCache(cacheKey, response, CACHE_TTL);
		}

		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in collections API:', message);
		throw error(500, `Failed to process collections request: ${message}`);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		const action = data.action;

		switch (action) {
			case 'recompile':
				// Clear Redis cache if available
				if (!browser && isRedisEnabled()) {
					await clearCache('api:collections:*');
				}

				// Force recompilation of collections
				await collectionManager.updateCollections(true);
				logger.info('Collections recompiled successfully');
				return json({
					success: true,
					message: 'Collections recompiled successfully'
				});

			default:
				throw error(400, 'Invalid action');
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in collections API:', message);
		throw error(500, `Failed to process collections request: ${message}`);
	}
};
