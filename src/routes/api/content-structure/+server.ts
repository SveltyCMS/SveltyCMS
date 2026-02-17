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

import type { ContentNodeOperation } from '@root/src/content/types';
// Auth
import { contentManager } from '@src/content/ContentManager';
// Redis
import { cacheService } from '@src/databases/CacheService';
import { dbAdapter } from '@src/databases/db';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { json } from '@sveltejs/kit';
// System Logger
import { logger } from '@utils/logger.server';
import { browser } from '$app/environment';

const CACHE_TTL = 300; // 5 minutes

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const GET = apiHandler(async ({ url, locals }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw new AppError('Tenant ID is required for this operation.', 400, 'TENANT_MISSING');
		}

		const action = url.searchParams.get('action');
		logger.debug('GET request received', { action, tenantId });

		if (!browser) {
			const cacheKey = `api:content-structure:${tenantId || 'global'}:${action || 'default'}`;
			const cached = await cacheService.get(cacheKey);
			if (cached) {
				logger.debug('Returning cached data from Redis', { action, tenantId });
				return json(cached);
			}
		}

		let response: any;

		switch (action) {
			case 'getStructure': {
				// Return full structure with metadata
				const contentNodes = await contentManager.getContentStructure();
				const version = contentManager.getContentVersion();

				response = {
					contentStructure: contentNodes,
					version
				};

				if (!browser) {
					const cacheKey = `api:content-structure:${tenantId || 'global'}:${action}`;
					await cacheService.set(cacheKey, response, CACHE_TTL);
				}

				return json({ data: response });
			}

			case 'getContentStructure': {
				// Return content nodes from database
				const contentStructure = await contentManager.getContentStructure();
				const version = contentManager.getContentVersion();
				logger.info('Returning content structure from database', { tenantId });
				response = {
					success: true,
					contentNodes: contentStructure,
					version
				};
				break;
			}

			default:
				throw new AppError('Invalid action', 400, 'INVALID_ACTION');
		}

		if (!browser) {
			const cacheKey = `api:content-structure:${tenantId || 'global'}:${action || 'default'}`;
			await cacheService.set(cacheKey, response, CACHE_TTL);
		}
		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in GET /api/content-structure:', message);
		if (err instanceof AppError) {
			throw err;
		}
		throw new AppError(`Failed to process content structure request: ${message}`, 500, 'CONTENT_STRUCTURE_ERROR');
	}
});

export const POST = apiHandler(async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// Authenticate later if not a recompile bypass
	request
		.clone()
		.json()
		.then((data) => data.action === 'recompile')
		.catch(() => false);

	try {
		const data = await request.json();
		const action = data.action;

		// TEMP BYPASS FOR DEBUGGING
		if (action === 'recompile' && !user) {
			logger.warn('⚠️ TEMPORARY AUTH BYPASS for recompile action');
			await contentManager.refresh(tenantId);
			return json({ success: true, message: 'Collections recompiled successfully (BYPASS)' });
		}

		if (!user) {
			throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
		}

		switch (action) {
			case 'reorderContentStructure': {
				const { items }: { items: ContentNodeOperation[] } = data;

				if (!(items && Array.isArray(items))) {
					throw new AppError('Items array is required for reorderContentStructure', 400, 'INVALID_ITEMS');
				}

				const updatedContentStructure = await contentManager.reorderContentNodes(items);

				if (!browser) {
					const cachePattern = `api:content-structure:${tenantId || 'global'}:*`;
					await cacheService.clearByPattern(cachePattern);
					logger.debug('Cleared content-structure cache after reorder.', { tenantId });
				}

				logger.info('Content structure reordered successfully', { tenantId });
				return json({
					success: true,
					contentStructure: updatedContentStructure,
					message: 'Content structure reordered successfully'
				});
			}

			case 'updateContentStructure': {
				const { items }: { items: ContentNodeOperation[] } = data;

				if (!(items && Array.isArray(items))) {
					throw new AppError('Items array is required for updateContentStructure', 400, 'INVALID_ITEMS');
				}

				const updatedContentStructure = await contentManager.upsertContentNodes(items);

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

				await contentManager.refresh(tenantId);
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

				await contentManager.refresh(tenantId);
				const contentStructure = await contentManager.getContentStructure();

				logger.info('Collections refreshed from compiled files', { tenantId, collectionsFound: contentStructure?.length || 0 });
				return json({
					success: true,
					contentNodes: contentStructure,
					message: 'Collections refreshed successfully'
				});
			}
			default:
				throw new AppError('Invalid action', 400, 'INVALID_ACTION');
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in POST /api/content-structure:', message);
		if (err instanceof AppError) {
			throw err;
		}
		throw new AppError(`Failed to process content structure request: ${message}`, 500, 'CONTENT_STRUCTURE_ERROR');
	}
});

export const PUT = apiHandler(async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw new AppError('Tenant ID is required for this operation.', 400, 'TENANT_MISSING');
		}

		const { _id, updates } = await request.json();

		if (!(_id && updates)) {
			throw new AppError('_id and updates are required', 400, 'MISSING_PARAMS');
		}

		if (!dbAdapter) {
			throw new AppError('Database adapter not available', 503, 'DB_UNAVAILABLE');
		}

		const updateResult = await dbAdapter.content.nodes.update(_id, updates);
		if (!(updateResult.success && updateResult.data)) {
			throw new AppError('Node not found', 404, 'NODE_NOT_FOUND');
		}

		const updatedNode = updateResult.data;

		// Invalidate cache after a single node update
		if (!browser) {
			const cachePattern = `api:content-structure:${tenantId || 'global'}:*`;
			await cacheService.clearByPattern(cachePattern);
			logger.debug(`Cleared content-structure cache after PUT update for node ${_id}.`, { tenantId });
		}

		await contentManager.refresh(tenantId);
		logger.info(`Content node ${_id} updated successfully`, { tenantId });
		return json({
			success: true,
			message: 'Content Structure updated successfully',
			data: updatedNode
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error in PUT /api/content-structure:', errorMessage);
		if (err instanceof AppError) {
			throw err;
		}
		throw new AppError(`Failed to update content structure: ${errorMessage}`, 500, 'CONTENT_STRUCTURE_ERROR');
	}
});
