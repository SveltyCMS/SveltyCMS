/* @file src/routes/api/graphql/resolvers/collections.ts
 * @description Dynamic GraphQL schema and resolver generation for collections.
 *
 * This module provides functionality to:
 * - Dynamically register collection schemas based on the CMS configuration
 * - Generate GraphQL type definitions and resolvers for each collection
 * - Handle complex field types and nested structures
 * - Integrate with Redis for caching (if enabled)
 *
 * Features:
 * - Dynamic schema generation based on widget configurations
 * - Support for extracted fields and nested structures
 * - Integration with custom widget schemas
 * - Redis caching for improved performance
 * - Error handling and logging
 *
 * Usage:
 * - Used by the main GraphQL setup to generate collection-specific schemas and resolvers
 * - Provides the foundation for querying collection data through the GraphQL API
 */

// System Logs
import logger from '@src/utils/logger';

import { dbAdapter } from '@src/databases/db';

// Registers collection schemas dynamically.
export function mediaTypeDefs() {
	return `
        type MediaImage {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaDocument {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaAudio {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaVideo {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaRemote {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }
    `;
}

// Builds resolvers for querying collection data.
export function mediaResolvers() {
	return {
		mediaImages: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_images', {});
			logger.info('Fetched media images', { count: result.length });
			return result;
		},
		mediaDocuments: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_documents', {});
			logger.info('Fetched media documents', { count: result.length });
			return result;
		},
		mediaAudio: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_audio', {});
			logger.info('Fetched media audio', { count: result.length });
			return result;
		},
		mediaVideos: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_videos', {});
			logger.info('Fetched media videos', { count: result.length });
			return result;
		},
		mediaRemote: async () => {
			if (!dbAdapter) {
				logger.error('Database adapter is not initialized');
				throw new Error('Database adapter is not initialized');
			}
			const result = await dbAdapter.findMany('media_remote', {});
			logger.info('Fetched media remote', { count: result.length });
			return result;
		}
	};
}
