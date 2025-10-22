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
 * Utilizes Redis caching for performance, now tenant-aware.
 */
import { browser } from '$app/environment';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { error, json, type RequestHandler } from '@sveltejs/kit';

import type { ContentNodeOperation } from '@src/content/types';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { dbAdapter } from '@src/databases/db';

// Redis
import { cacheService } from '@src/databases/CacheService';

// System Logger
import { logger } from '@utils/logger.svelte';

const CACHE_TTL = 300; // 5 minutes

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant ID is required for this operation.');
		}

		const action = url.searchParams.get('action');
		logger.debug('GET request received', { action, tenantId }); // Try to get from Redis cache first

		if (!browser) {
			const cacheKey = `api:content-structure:${tenantId || 'global'}:${action || 'default'}`;
			const cached = await cacheService.get(cacheKey);
			if (cached) {
				logger.debug('Returning cached data from Redis', { action, tenantId });
				return json(cached);
			}
		}

		let response;

		switch (action) {
			case 'getStructure': {
				// Return full structure with metadata
				const contentNodes = await contentManager.getContentStructure(tenantId);

				response = {
					contentStructure: contentNodes
				}; // Cache the response if Redis is enabled

				if (!browser) {
					const cacheKey = `api:content-structure:${tenantId || 'global'}:${action}`;
					await cacheService.set(cacheKey, response, CACHE_TTL);
				}

				return json({ data: response });
			}

			case 'getContentStructure': {
				// Return content nodes from database
				const contentStructure = await contentManager.getContentStructure(tenantId);
				logger.info('Returning content structure from database', { tenantId });
				response = {
					success: true,
					contentNodes: contentStructure
				};
				break; // Continue to caching and return
			}

			default:
				throw error(400, 'Invalid action');
		} // Cache in Redis if available

		if (!browser) {
			const cacheKey = `api:content-structure:${tenantId || 'global'}:${action || 'default'}`;
			await cacheService.set(cacheKey, response, CACHE_TTL);
		}
		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in GET /api/content-structure:', message);
		throw error(500, `Failed to process content structure request: ${message}`);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant ID is required for this operation.');
		}

		const data = await request.json();
		const action = data.action;
		logger.debug('POST request received', { data, action, tenantId });

		switch (action) {
			case 'updateContentStructure': {
				const { items }: { items: ContentNodeOperation[] } = data;

				if (!items || !Array.isArray(items)) {
					throw error(400, 'Items array is required for updateContentStructure');
				}

				const updatedContentStructure = await contentManager.upsertContentNodes(items, tenantId);

				if (!browser) {
					const cachePattern = `api:content-structure:${tenantId || 'global'}:*`;
					await cacheService.clearByPattern(cachePattern);
					logger.debug('Cleared content-structure cache after update.', { tenantId });
				}

				logger.info('Content structure metadata updated successfully', { tenantId });
				return json({
					success: true,
					contentStructure: updatedContentStructure,
					message: 'Content structure metadata updated successfully'
				});
			}
			case 'recompile': {
				if (!browser) {
					const cachePattern = `api:content-structure:${tenantId || 'global'}:*`;
					await cacheService.clearByPattern(cachePattern);
					logger.debug('Cleared all content-structure related caches.', { tenantId });
				}

				await contentManager.updateCollections(true, tenantId);
				logger.info('Collections recompiled successfully', { tenantId });
				return json({
					success: true,
					message: 'Collections recompiled successfully'
				});
			}
			case 'refreshCollections': {
				// Refresh collections from compiled files without recompiling
				if (!browser) {
					const cachePattern = `api:content-structure:${tenantId || 'global'}:*`;
					await cacheService.clearByPattern(cachePattern);
					logger.debug('Cleared content-structure caches for refresh.', { tenantId });
				}

				await contentManager.updateCollections(true, tenantId);
				const contentStructure = await contentManager.getContentStructure(tenantId);

				logger.info('Collections refreshed from compiled files', { tenantId, collectionsFound: contentStructure?.length || 0 });
				return json({
					success: true,
					contentNodes: contentStructure,
					message: 'Collections refreshed successfully'
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
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant ID is required for this operation.');
		}

		const { _id, updates } = await request.json();

		if (!_id || !updates) {
			throw error(400, '_id and updates are required');
		}

		const updatedNode = await dbAdapter.updateContentStructure(_id, updates, tenantId);
		if (!updatedNode) throw error(404, 'Node not found'); // Invalidate cache after a single node update

		if (!browser) {
			const cachePattern = `api:content-structure:${tenantId || 'global'}:*`;
			await cacheService.clearByPattern(cachePattern);
			logger.debug(`Cleared content-structure cache after PUT update for node ${_id}.`, { tenantId });
		}

		await contentManager.updateCollections(true, tenantId);
		logger.info(`Content node \x1b[34m${_id}\x1b[0m updated successfully`, { tenantId });
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
