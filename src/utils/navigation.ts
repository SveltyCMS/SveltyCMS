/**
 * @file src/utils/navigation.ts
 * @description Navigation utility functions for redirecting users after authentication
 */

import { publicEnv } from '@root/config/public';
import { dbInitPromise } from '@src/databases/db';
import { contentManager } from '@root/src/content/ContentManager';
import { logger } from '@utils/logger.svelte';

/**
 * Helper function to fetch and redirect to the first collection
 * Used after successful user registration/login to redirect to the first available collection
 * 
 * @returns {Promise<string>} The redirect URL path
 */
export async function getFirstCollectionRedirectUrl(): Promise<string> {
    try {
        // Wait for system initialization including ContentManager
        await dbInitPromise;
        logger.debug('System ready, proceeding with collection retrieval');

        // First try to get the first collection directly
        const firstCollection = await contentManager.getFirstCollection();
        if (firstCollection && firstCollection.path) {
            const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';

            // Use the collection's path for user-friendly URLs
            const redirectUrl = `/${defaultLanguage}${firstCollection.path}`;

            logger.info(`Redirecting to first collection: ${firstCollection.name} (${firstCollection._id}) at path: ${firstCollection.path}`);
            return redirectUrl;
        }

        // Fallback: Get content structure with UUIDs
        let contentNodes = [];
        try {
            if (!contentManager) throw new Error('Content manager not initialized');
            // ContentManager should already be initialized due to dbInitPromise
            contentNodes = contentManager.getContentStructure();
            if (!Array.isArray(contentNodes)) {
                logger.warn('Content structure is not an array', { type: typeof contentNodes, value: contentNodes });
                contentNodes = [];
            }
        } catch (dbError) {
            logger.error('Failed to fetch content structure', dbError);
            return '/';
        }

        if (!contentNodes?.length) {
            logger.warn('No collections found in content structure');
            return '/';
        }

        // Find first collection using nodeType - sort by order or name for consistency
        const collections = contentNodes.filter((node) => node.nodeType === 'collection' && node._id);
        if (collections.length > 0) {
            // Sort collections by order field (if available) or by name for consistent selection
            const sortedCollections = collections.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                }
                return (a.name || '').localeCompare(b.name || '');
            });

            const firstCollectionNode = sortedCollections[0];
            const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';

            // Use the collection's actual path if available, otherwise construct from _id
            const collectionPath = firstCollectionNode.path || `/${firstCollectionNode._id}`;
            const redirectUrl = `/${defaultLanguage}${collectionPath}`;

            logger.info(`Redirecting to first collection from structure: ${firstCollectionNode.name} (${firstCollectionNode._id}) at path: ${collectionPath}`);
            return redirectUrl;
        }

        logger.warn('No valid collections found');
        return '/';
    } catch (err) {
        logger.error('Error in getFirstCollectionRedirectUrl:', err);
        return '/';
    }
}
