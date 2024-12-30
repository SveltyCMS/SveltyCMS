/**
 * @file src/routes/api/graphql/resolvers/media.ts
 * @description Dynamic GraphQL schema and resolver generation for media.
 *
 * This module provides functionality to:
 * - Dynamically register media schemas based on the CMS configuration
 * - Generate GraphQL type definitions and resolvers for each media type
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
 * - Used by the main GraphQL setup to generate media-specific schemas and resolvers
 * - Provides the foundation for querying media data through the GraphQL API
 */

import { dbAdapter } from '@src/databases/db';
// System Logs
import { logger } from '@utils/logger.svelte';

// Registers media schemas dynamically.
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

// GraphQL Types
interface PaginationArgs {
    pagination: {
        page: number;
        limit: number;
    };
}

// GraphQL parent type for media resolvers
type MediaResolverParent = unknown;

// Builds resolvers for querying media data with pagination support.
export function mediaResolvers() {
    const fetchWithPagination = async (contentTypes: string, pagination: { page: number; limit: number }) => {
        if (!dbAdapter) {
            logger.error('Database adapter is not initialized');
            throw Error('Database adapter is not initialized');
        }

        const { page = 1, limit = 50 } = pagination || {};
        const skip = (page - 1) * limit;

        try {
            const result = await dbAdapter.findMany(contentTypes, {}, { sort: { createdAt: -1 }, skip, limit });
            logger.info(`Fetched ${contentTypes}`, { count: result.length });
            return result;
        } catch (error) {
            logger.error(`Error fetching data for ${contentTypes}:`, error);
            throw Error(`Failed to fetch data for ${contentTypes}`);
        }
    };

    return {
        mediaImages: async (_: MediaResolverParent, args: PaginationArgs) => await fetchWithPagination('media_images', args.pagination),
        mediaDocuments: async (_: MediaResolverParent, args: PaginationArgs) => await fetchWithPagination('media_documents', args.pagination),
        mediaAudio: async (_: MediaResolverParent, args: PaginationArgs) => await fetchWithPagination('media_audio', args.pagination),
        mediaVideos: async (_: MediaResolverParent, args: PaginationArgs) => await fetchWithPagination('media_videos', args.pagination),
        mediaRemote: async (_: MediaResolverParent, args: PaginationArgs) => await fetchWithPagination('media_remote', args.pagination)
    };
}
