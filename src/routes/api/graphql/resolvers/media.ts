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

import { privateEnv } from '@root/config/private';

import type { DatabaseAdapter } from '@src/databases/dbInterface';
// System Logs
import { logger } from '@utils/logger.svelte';

// Permissions

// Types
import type { User } from '@src/auth/types';

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
    `;
}

// GraphQL Types
interface PaginationArgs {
	pagination: {
		page: number;
		limit: number;
	};
}

// GraphQL context type
interface GraphQLContext {
	user?: User;
	tenantId?: string;
}

// GraphQL parent type for media resolvers
type MediaResolverParent = unknown;

// Builds resolvers for querying media data with pagination support.
import type { DatabaseAdapter } from '@src/databases/dbInterface';

export function mediaResolvers(dbAdapter: DatabaseAdapter) {
	const fetchWithPagination = async (contentTypes: string, pagination: { page: number; limit: number }, context: GraphQLContext) => {
		// Check media permissions
		if (!context.user) {
			logger.warn(`GraphQL: No user in context for media type ${contentTypes}`);
			throw new Error('Authentication required');
		}

		// Authentication is handled by hooks.server.ts - user presence confirms access

		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw Error('Database adapter is not initialized');
		}

		if (privateEnv.MULTI_TENANT && !context.tenantId) {
			logger.error('GraphQL: Tenant ID is missing from context in a multi-tenant setup.');
			throw new Error('Internal Server Error: Tenant context is missing.');
		}

		const { page = 1, limit = 50 } = pagination || {};

		try {
			// --- MULTI-TENANCY: Scope the query by tenantId ---
			const query: { tenantId?: string } = {};
			if (privateEnv.MULTI_TENANT) {
				query.tenantId = context.tenantId;
			}

			// Use query builder pattern consistent with REST API
			const queryBuilder = dbAdapter.queryBuilder(contentTypes).where(query).sort('createdAt', 'desc').paginate({ page, pageSize: limit });

			const result = await queryBuilder.execute();

			if (!result.success) {
				throw new Error(`Database query failed: ${result.error?.message || 'Unknown error'}`);
			}

			logger.info(`Fetched ${contentTypes}`, { count: result.data.length, tenantId: context.tenantId });
			return result.data;
		} catch (error) {
			logger.error(`Error fetching data for ${contentTypes}:`, { error, tenantId: context.tenantId });
			throw Error(`Failed to fetch data for ${contentTypes}`);
		}
	};

	return {
		mediaImages: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchWithPagination('media_images', args.pagination, context),
		mediaDocuments: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchWithPagination('media_documents', args.pagination, context),
		mediaAudio: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchWithPagination('media_audio', args.pagination, context),
		mediaVideos: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchWithPagination('media_videos', args.pagination, context),
		mediaRemote: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchWithPagination('media_remote', args.pagination, context)
	};
}
