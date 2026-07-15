/**
 * @file src/routes/api/graphql/resolvers/media.ts
 * @description Dynamic GraphQL schema and resolver generation for media.
 */

import type { User } from "@src/databases/auth/types";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import { isMultiTenantEnabled } from "@utils/tenant";
import { logger } from "@utils/logger";

// Registers media schemas dynamically.
export function mediaTypeDefs() {
  return `
        type MediaImage {
            _id: String
            url: String
            createdAt: String
            updatedAt: String
        }

        type MediaFolder {
            _id: String
            name: String
            path: String
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
  tenantId?: string | null;
  user?: User;
}

type MediaResolverParent = unknown;

// Builds resolvers for querying media data with pagination support.
export function mediaResolvers(dbAdapter: DatabaseAdapter) {
  if (!dbAdapter) {
    throw new Error("Database adapter is not initialized");
  }

  const fetchMediaByType = async (
    mimeTypeFilter: Record<string, unknown> | null,
    pagination: { page?: number; limit?: number } | undefined,
    context: GraphQLContext,
  ) => {
    if (!context.user) {
      throw new Error("Authentication required");
    }

    const { page = 1, limit = 50 } = pagination || {};

    try {
      // Build filter for multi-tenant and media type
      const filter: Record<string, unknown> = {};
      if (isMultiTenantEnabled() && context.tenantId) {
        filter.tenantId = context.tenantId;
      }

      // Push MIME type filter to DB — avoids loading non-matching rows into memory
      if (mimeTypeFilter) {
        Object.assign(filter, mimeTypeFilter);
      }

      // Use crud.findMany to query media collection with server-side filtering
      const result = await dbAdapter.crud.findMany("media", filter, {
        limit,
        offset: (page - 1) * limit,
        sort: { createdAt: "desc" },
      });

      if (!result.success) {
        throw new Error(result.error?.message || "Query failed");
      }

      return result.data || [];
    } catch (error) {
      logger.error("Error fetching media:", {
        error: error instanceof Error ? error.message : String(error),
        tenantId: context.tenantId,
      });
      throw new Error("Failed to fetch media");
    }
  };

  return {
    mediaImages: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      await fetchMediaByType({ mimeType: { $regex: "^image/" } }, args.pagination, context),
    mediaDocuments: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      await fetchMediaByType(
        { mimeType: { $regex: "^(application|text)/" } },
        args.pagination,
        context,
      ),
    mediaAudio: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      await fetchMediaByType({ mimeType: { $regex: "^audio/" } }, args.pagination, context),
    mediaVideos: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      await fetchMediaByType({ mimeType: { $regex: "^video/" } }, args.pagination, context),
    mediaRemote: async (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      await fetchMediaByType(null, args.pagination, context),
  };
}
