/**
 * @file src/routes/api/content-structure/+server.ts
 * @description Unified API endpoint for managing content structure metadata
 *
 * @example GET /api/content-structure?operation=getContentStructure
 *
 * #Features:
 * Lists all collections accessible to the current user
 * Filters collections based on user permissions
 * Provides collection metadata and configuration
 * Handles creation, updates (including reordering and parent changes), and deletion of content nodes.
 * Utilizes Redis caching for performance.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { browser } from '$app/environment';

import type { ContentNodeOperation } from '@root/src/content/types';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { dbAdapter } from '@src/databases/db';
import { checkApiPermission } from '@api/permissions';

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';

// System Logger
import { logger } from '@utils/logger.svelte';

const CACHE_TTL = 300; // 5 minutes

export const GET: RequestHandler = async ({ url, locals }) => {
	// Check permissions using centralized system
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'system',
		action: 'read'
	});

	if (!permissionResult.hasPermission) {
		return json(
			{
				error: permissionResult.error || 'Forbidden'
			},
			{ status: permissionResult.error?.includes('Authentication') ? 401 : 403 }
		);
	}

	try {
		const action = url.searchParams.get('action');
		logger.debug('GET request received', { action });

		// Try to get from Redis cache first
		if (!browser && isRedisEnabled()) {
			const cacheKey = `api:content-structure:${action || 'default'}`;
			const cached = await getCache(cacheKey);
			if (cached) {
				logger.debug('Returning cached data from Redis', { action });
				return json(cached);
			}
		}

		let response;

		switch (action) {
			case 'getStructure': {
				// Return full structure with metadata
				const { contentStructure: contentNodes } = await contentManager.getCollectionData();

				response = {
					contentStructure: contentNodes
				};

				// Cache the response if Redis is enabled
				if (!browser && isRedisEnabled()) {
					const cacheKey = `api:content-structure:${action}`;
					await setCache(cacheKey, response, CACHE_TTL);
				}

				return json({ data: response });
			}

			case 'getContentStructure': {
				// Return content nodes from database
				const { contentStructure } = await contentManager.getCollectionData();
				logger.info('Returning content structure from database');
				response = {
					success: true,
					contentNodes: contentStructure
				};
				break; // Continue to caching and return
			}

			default:
				throw error(400, 'Invalid action');
		}

		// Cache in Redis if available
		if (!browser && isRedisEnabled()) {
			const cacheKey = `api:content-structure:${action || 'default'}`;
			await setCache(cacheKey, response, CACHE_TTL);
		}
		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in GET /api/content-structure:', message);
		throw error(500, `Failed to process content structure request: ${message}`);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check permissions using centralized system
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'system',
		action: 'write'
	});

	if (!permissionResult.hasPermission) {
		return json(
			{
				error: permissionResult.error || 'Forbidden'
			},
			{ status: permissionResult.error?.includes('Authentication') ? 401 : 403 }
		);
	}

	try {
		const data = await request.json();
		const action = data.action;
		logger.debug('POST request received', { data, action });

		switch (action) {
			case 'updateContentStructure': {
				// Updates metadata for categories and collections based on operations from the frontend
				const { items }: { items: ContentNodeOperation[] } = data;

				if (!items || !Array.isArray(items)) {
					throw error(400, 'Items array is required for updateContentStructure');
				}

				// The `contentManager.upsertContentNodes` method is expected to:
				// 1. Iterate through `items`.
				// 2. For each `ContentNodeOperation` (type: 'create', 'update', 'rename', 'move'):
				//    a. Perform the respective database operation (insert, update, delete).
				//    b. Crucially, handle `parentId` and `order` fields for 'move' operations.
				// 3. Return the *complete, flattened, and updated content structure* from the database.
				const updatedContentStructure = await contentManager.upsertContentNodes(items);

				// Clear content structure cache as data has changed
				if (!browser && isRedisEnabled()) {
					await clearCache('api:content-structure:*');
					logger.debug('Cleared content-structure cache after update.');
				}

				logger.info('Content structure metadata updated successfully');
				return json({
					success: true,
					contentStructure: updatedContentStructure, // Send back the updated structure for frontend re-sync
					message: 'Content structure metadata updated successfully'
				});
			}
			case 'recompile': {
				// Clear Redis cache if available
				if (!browser && isRedisEnabled()) {
					await clearCache('api:content-structure:*');
					logger.debug('Cleared all content-structure related caches.');
				}

				// Reset the content manager's internal state and force recompilation
				await contentManager.updateCollections(true);
				logger.info('Collections recompiled successfully');
				return json({
					success: true,
					message: 'Collections recompiled successfully'
				});
			}
			default:
				throw error(400, 'Invalid action');
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in POST /api/content-structure:', message);
		throw error(500, `Failed to process content structure request: ${message}`);
	}
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	// Check permissions using centralized system
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'system',
		action: 'write'
	});

	if (!permissionResult.hasPermission) {
		return json(
			{
				error: permissionResult.error || 'Forbidden'
			},
			{ status: permissionResult.error?.includes('Authentication') ? 401 : 403 }
		);
	}

	try {
		const { _id, updates } = await request.json();

		if (!_id || !updates) {
			throw error(400, '_id and updates are required');
		}

		const updatedNode = await dbAdapter.updateContentStructure(_id, updates);
		if (!updatedNode) throw error(404, 'Node not found');

		// Invalidate cache after a single node update
		if (!browser && isRedisEnabled()) {
			await clearCache('api:content-structure:*');
			logger.debug(`Cleared content-structure cache after PUT update for node ${_id}.`);
		}
		// Update content manager's internal state (recompile if necessary)
		// Assuming updateCollections(true) forces a full re-read and recompile
		await contentManager.updateCollections(true); // This might be heavy; consider a more targeted update if possible
		logger.info(`Content node \x1b[34m${_id}\x1b[0m updated successfully`);
		return json({
			success: true,
			message: 'Content Structure updated successfully',
			data: updatedNode
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error in PUT /api/content-structure:', errorMessage);
		throw error(500, `Failed to update content structure: ${errorMessage}`);
	}
};
