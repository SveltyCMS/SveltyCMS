/**
 * @file src/routes/api/content-structure/+server.ts
 * @description Unified API endpoint for managing content structure metadata
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { contentManager } from '@src/content/ContentManager';
import type { CollectionData, Schema } from '@root/src/content/types';
import { dbAdapter } from '@src/databases/db';

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';

// System Logger
import { logger } from '@utils/logger.svelte';

const CACHE_TTL = 300; // 5 minutes

export const GET: RequestHandler = async ({ url }) => {
    try {
        const action = url.searchParams.get('action');
        logger.debug('GET request received', { action });

        // Try to get from Redis cache first
        if (!browser && isRedisEnabled()) {
            const cacheKey = `api:content-structure:${action || 'default'}`;
            const cached = await getCache(cacheKey);
            if (cached) {
                logger.debug('Returning cached data', { action });
                return json(cached);
            }
        }

        let response;

        switch (action) {
            case 'getStructure':
                // Return full structure with metadata
                const { collections, categories } = contentManager.getCollectionData();
                const contentNodes = await dbAdapter.getContentNodes();

                // Create a map for faster lookup
                const nodeMap = new Map(contentNodes.map(node => [node.path, node]));

                // Merge metadata with the collections and categories
                const mergedCategories = Object.fromEntries(Object.entries(categories).map(([key, category]) => {
                    const node = nodeMap.get(key);
                    return [key, { ...category, ...node }];
                }));

                const mergedCollections = Object.fromEntries(Object.entries(collections).map(([key, collection]) => {
                    const node = nodeMap.get(collection.path);
                    return [key, { ...collection, ...node }];
                }));

                logger.info('Returning full content structure with metadata');
                response = {
                    success: true,
                    data: {
                        collections: mergedCollections,
                        categories: mergedCategories
                    }
                };
                break;

            case 'getContentNodes':
                // Return content nodes from database
                const contentNodesDB = await dbAdapter.getContentNodes();
                logger.info('Returning content nodes from database');
                response = {
                    success: true,
                    contentNodes: contentNodesDB
                };
                break;

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

export const POST: RequestHandler = async ({ request }) => {
    try {
        const data = await request.json();
        const action = data.action;
        logger.debug('POST request received', { data, action });

        switch (action) {
            case 'updateMetadata':
                // Updates metadata for categories and collections
                const { items } = data;

                if (!items || !Array.isArray(items)) {
                    throw error(400, 'Items array is required');
                }

                const updatePromises = items.map(async (item: SystemContent) => {
                    if (item.id) {
                        return await dbAdapter.updateContentNode(item.id, item);
                    } else {
                        // If item does not have an ID, it's a new item that does not have metadata.
                        // Add default icon if it's missing
                        const itemWithDefaults = {
                            ...item,
                            icon: item.icon || (item.isCollection ? 'bi:file-text' : 'bi:folder'),
                            order: item.order || 999
                        }

                        return await dbAdapter.createContentNode(itemWithDefaults);
                    }
                });
                await Promise.all(updatePromises);

                await contentManager.updateCollections(true);
                logger.info('Content structure metadata updated successfully');
                return json({
                    success: true,
                    message: 'Content structure metadata updated successfully'
                });
            case 'recompile':
                // Clear Redis cache if available
                if (!browser && isRedisEnabled()) {
                    await clearCache('api:content-structure:*');
                }

                // Force recompilation of collections
                await contentManager.updateCollections(true);
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
        logger.error('Error in POST /api/content-structure:', message);
        throw error(500, `Failed to process content structure request: ${message}`);
    }
};
export const PUT: RequestHandler = async ({ request }) => {
    try {
        const { nodeId, updates } = await request.json();

        if (!nodeId || !updates) {
            throw error(400, 'NodeId and updates are required');
        }

        const updatedNode = await dbAdapter.updateContentNode(nodeId, updates);
        if (!updatedNode) throw error(404, 'Node not found');
        // Update collections to reflect the changes
        await contentManager.updateCollections(true);
        logger.info(`Content node ${nodeId} updated successfully`);
        return json({
            success: true,
            message: 'Content node updated successfully',
            data: updatedNode
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in PUT /api/content-structure:', errorMessage);
        throw error(500, `Failed to update content node: ${errorMessage}`);
    }
};