/**
 * @file src/routes/api/graphql/resolvers/media.ts
 * @description Dynamic GraphQL schema and resolver generation for media.
 */

import { getPrivateSettingSync } from '@shared/services/settingsService';
import type { DatabaseAdapter, BaseEntity } from '@shared/database/dbInterface';
import { logger } from '@shared/utils/logger.server';
import type { User } from '@shared/database/auth/types';

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

interface PaginationArgs {
	pagination: {
		page: number;
		limit: number;
	};
}

interface GraphQLContext {
	user?: User;
	tenantId?: string;
}

type MediaResolverParent = unknown;

interface MediaEntity extends BaseEntity {
	url?: string;
	tenantId?: string;
}

// Builds resolvers for querying media data with pagination support.
export function mediaResolvers(dbAdapter: DatabaseAdapter) {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}

	const fetchWithPagination = async (contentTypes: string, pagination: { page: number; limit: number }, context: GraphQLContext) => {
		if (!context.user) throw new Error('Authentication required');

		if (getPrivateSettingSync('MULTI_TENANT') && !context.tenantId) {
			throw new Error('Internal Server Error: Tenant context is missing.');
		}

		const { page = 1, limit = 50 } = pagination || {};

		try {
			const query: Partial<MediaEntity> = {};
			if (getPrivateSettingSync('MULTI_TENANT')) {
				query.tenantId = context.tenantId;
			}

			const result = await dbAdapter
				.queryBuilder<MediaEntity>(contentTypes)
				.where(query)
				.sort('createdAt', 'desc')
				.paginate({ page, pageSize: limit })
				.execute();

			if (!result.success) throw new Error(result.error?.message || 'Query failed');

			return result.data;
		} catch (error) {
			logger.error(`Error fetching data for ${contentTypes}:`, {
				error: error instanceof Error ? error.message : String(error),
				tenantId: context.tenantId
			});
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
