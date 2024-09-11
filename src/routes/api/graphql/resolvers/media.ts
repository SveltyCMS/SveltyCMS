/**
 * @file src/routes/api/graphql/resolvers/collections.ts
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

import { dbAdapter } from '@src/databases/db';
// System Logs
import logger from '@src/utils/logger';
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

        input PaginationInput {
            page: Int = 1
            limit: Int = 50
        }
    `;
}

// Builds resolvers for querying collection data with pagination support.
export function mediaResolvers() {
	const fetchWithPagination = async (collectionName: string, pagination: { page: number; limit: number }) => {
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw new Error('Database adapter is not initialized');
		}

		const { page = 1, limit = 50 } = pagination || {};
		const skip = (page - 1) * limit;

		try {
			const result = await dbAdapter.findMany(collectionName, {}, { sort: { createdAt: -1 }, skip, limit });
			logger.info(`Fetched ${collectionName}`, { count: result.length });
			return result;
		} catch (error) {
			logger.error(`Error fetching data for ${collectionName}:`, error);
			throw new Error(`Failed to fetch data for ${collectionName}`);
		}
	};

	return {
		mediaImages: async (_: any, args: { pagination: { page: number; limit: number } }) => await fetchWithPagination('media_images', args.pagination),
		mediaDocuments: async (_: any, args: { pagination: { page: number; limit: number } }) =>
			await fetchWithPagination('media_documents', args.pagination),
		mediaAudio: async (_: any, args: { pagination: { page: number; limit: number } }) => await fetchWithPagination('media_audio', args.pagination),
		mediaVideos: async (_: any, args: { pagination: { page: number; limit: number } }) => await fetchWithPagination('media_videos', args.pagination),
		mediaRemote: async (_: any, args: { pagination: { page: number; limit: number } }) => await fetchWithPagination('media_remote', args.pagination)
	};
}
