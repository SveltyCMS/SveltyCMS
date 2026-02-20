/**
 * @file src/routes/api/graphql/resolvers/media.ts
 * @description Dynamic GraphQL schema and resolver generation for media.
 */

import type { User } from '@src/databases/auth/types';
import type { BaseEntity, DatabaseAdapter } from '@src/databases/db-interface';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { logger } from '@utils/logger.server';

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
	tenantId?: string;
	user?: User;
}

type MediaResolverParent = unknown;

interface MediaEntity extends BaseEntity {
	tenantId?: string;
	url?: string;
}

// MIME type patterns for media type filtering
const MIME_PATTERNS = {
	images: /^image\//,
	documents: /^(application\/(pdf|msword|vnd\.(openxmlformats|oasis|ms-)|zip|x-rar)|text\/)/,
	audio: /^audio\//,
	videos: /^video\//,
	remote: /^(https?:\/\/|data:)/ // Remote URLs or data URIs
};

// Builds resolvers for querying media data with pagination support.
export function mediaResolvers(dbAdapter: DatabaseAdapter) {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}

	const fetchMediaByType = async (mimePattern: RegExp | null, pagination: { page?: number; limit?: number } | undefined, context: GraphQLContext) => {
		if (!context.user) {
			throw new Error('Authentication required');
		}

		const { page = 1, limit = 50 } = pagination || {};

		try {
			// Build filter for multi-tenant and media type
			const filter: Record<string, unknown> = {};
			if (getPrivateSettingSync('MULTI_TENANT') && context.tenantId) {
				filter.tenantId = context.tenantId;
			}

			// Use crud.findMany to query media collection
			const result = await dbAdapter.crud.findMany('media', filter, {
				limit,
				offset: (page - 1) * limit,
				sort: { createdAt: 'desc' }
			});

			if (!result.success) {
				throw new Error(result.error?.message || 'Query failed');
			}

			// Filter by MIME type pattern if specified
			let data = result.data || [];
			if (mimePattern) {
				data = data.filter((item: MediaEntity) => {
					const mimeType = (item as MediaEntity & { mimeType?: string }).mimeType;
					return mimeType && mimePattern.test(mimeType);
				});
			}

			return data;
		} catch (error) {
			logger.error('Error fetching media:', {
				error: error instanceof Error ? error.message : String(error),
				tenantId: context.tenantId
			});
			throw new Error('Failed to fetch media');
		}
	};

	return {
		mediaImages: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchMediaByType(MIME_PATTERNS.images, args.pagination, context),
		mediaDocuments: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchMediaByType(MIME_PATTERNS.documents, args.pagination, context),
		mediaAudio: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchMediaByType(MIME_PATTERNS.audio, args.pagination, context),
		mediaVideos: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchMediaByType(MIME_PATTERNS.videos, args.pagination, context),
		mediaRemote: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
			await fetchMediaByType(null, args.pagination, context) // Remote media doesn't have standard MIME types
	};
}
