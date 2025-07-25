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

import { dbAdapter } from '@src/databases/db';
// System Logs
import { logger } from '@utils/logger.svelte';

// Permissions
import { checkApiPermission } from '@api/permissions';

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
export function mediaResolvers() {
	const fetchWithPagination = async (contentTypes: string, pagination: { page: number; limit: number }, context: GraphQLContext) => {
		// Check media permissions
		if (!context.user) {
			logger.warn(`GraphQL: No user in context for media type ${contentTypes}`);
			throw new Error('Authentication required');
		}

		const permissionResult = await checkApiPermission(context.user, {
			resource: 'media',
			action: 'read'
		});

		if (!permissionResult.hasPermission) {
			logger.warn(`GraphQL: User ${context.user._id} denied access to media type ${contentTypes}`);
			throw new Error(`Access denied: ${permissionResult.error || 'Insufficient permissions for media access'}`);
		}

		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw Error('Database adapter is not initialized');
		}

		if (privateEnv.MULTI_TENANT && !context.tenantId) {
			logger.error('GraphQL: Tenant ID is missing from context in a multi-tenant setup.');
			throw new Error('Internal Server Error: Tenant context is missing.');
		}

		const { page = 1, limit = 50 } = pagination || {};
		const skip = (page - 1) * limit;

		try {
			// --- MULTI-TENANCY: Scope the query by tenantId ---
			const query: { tenantId?: string } = {};
			if (privateEnv.MULTI_TENANT) {
				query.tenantId = context.tenantId;
			}

			const result = await dbAdapter.findMany(contentTypes, query, { sort: { createdAt: -1 }, skip, limit });
			logger.info(`Fetched ${contentTypes}`, { count: result.length, tenantId: context.tenantId });
			return result;
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
