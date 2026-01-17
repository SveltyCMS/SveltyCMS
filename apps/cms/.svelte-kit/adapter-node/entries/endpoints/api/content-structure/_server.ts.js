import { browser } from '../../../../chunks/index3.js';
import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { json, error } from '@sveltejs/kit';
import { contentManager } from '../../../../chunks/ContentManager.js';
import { d as dbAdapter } from '../../../../chunks/db.js';
import { cacheService } from '../../../../chunks/CacheService.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const CACHE_TTL = 300;
const GET = async ({ url, locals }) => {
	const { user, tenantId } = locals;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant ID is required for this operation.');
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
		let response;
		switch (action) {
			case 'getStructure': {
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
				throw error(400, 'Invalid action');
		}
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
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
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
			case 'reorderContentStructure': {
				const { items } = data;
				if (!items || !Array.isArray(items)) {
					throw error(400, 'Items array is required for reorderContentStructure');
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
				const { items } = data;
				if (!items || !Array.isArray(items)) {
					throw error(400, 'Items array is required for updateContentStructure');
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
				throw error(400, 'Invalid action');
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Error in POST /api/content-structure:', message);
		throw error(500, `Failed to process content structure request: ${message}`);
	}
};
const PUT = async ({ request, locals }) => {
	const { user, tenantId } = locals;
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
		if (!dbAdapter) {
			throw error(503, 'Database adapter not available');
		}
		const updateResult = await dbAdapter.content.nodes.update(_id, updates);
		if (!updateResult.success || !updateResult.data) {
			throw error(404, 'Node not found');
		}
		const updatedNode = updateResult.data;
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
		throw error(500, `Failed to update content structure: ${errorMessage}`);
	}
};
export { GET, POST, PUT };
//# sourceMappingURL=_server.ts.js.map
