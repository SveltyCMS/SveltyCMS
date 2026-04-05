/**
 * @file src/routes/api/graphql/resolvers/media.ts
 * @description Dynamic GraphQL schema and resolver generation for media.
 */

import type { User } from "@src/databases/auth/types";
import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { logger } from "@utils/logger.server";

// Registers media schemas dynamically using a DRY approach.
export function mediaTypeDefs() {
  const mediaTypes = ["MediaImage", "MediaDocument", "MediaAudio", "MediaVideo", "MediaRemote"];

  const commonFields = `
    _id: String
    url: String
    createdAt: String
    updatedAt: String
  `;

  return mediaTypes.map((type) => `type ${type} { ${commonFields} }`).join("\n\n");
}

interface PaginationArgs {
  pagination: {
    page: number;
    limit: number;
  };
}

interface GraphQLContext {
  tenantId?: string | null;
  bypassTenantIsolation?: boolean;
  user?: User;
}

type MediaResolverParent = unknown;

/**
 * Filter definitions for specific media types.
 * Optimized to use database-level regex filters.
 */
const MEDIA_FILTERS = {
  images: { mimeType: { $regex: "^image/" } },
  documents: {
    mimeType: {
      $regex: "^(application/(pdf|msword|vnd\\.(openxmlformats|oasis|ms-)|zip|x-rar)|text/)",
    },
  },
  audio: { mimeType: { $regex: "^audio/" } },
  videos: { mimeType: { $regex: "^video/" } },
  remote: { url: { $regex: "^(https?://|data:)" } }, // Applies to URL, not mimeType
};

// Builds resolvers for querying media data with pagination support.
export function mediaResolvers(dbAdapter: DatabaseAdapter) {
  if (!dbAdapter) {
    throw new Error("Database adapter is not initialized");
  }

  const fetchMedia = async (
    filterOverride: Record<string, any>,
    pagination: { page?: number; limit?: number } | undefined,
    context: GraphQLContext,
  ) => {
    if (!context.user) {
      throw new Error("Authentication required");
    }

    const { page = 1, limit = 50 } = pagination || {};
    const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");

    try {
      // Strict boundary bypass check
      if (isMultiTenant) {
        const userTenant = context.user.tenantId;
        if (userTenant && userTenant !== context.tenantId) {
          if (!context.bypassTenantIsolation) {
            throw new Error("Forbidden: Tenant isolation mismatch");
          }

          // Fire-and-forget audit log, but track failures
          import("@src/services/audit-log-service")
            .then((module) => {
              module.auditLogService.logEvent({
                action: "security_bypass",
                actorId: (context.user?._id || "system") as DatabaseId,
                eventType: module.AuditEventType.UNAUTHORIZED_ACCESS,
                severity: "medium",
                result: "success",
                details: {
                  description: "Global admin bypassed tenant isolation in GraphQL Media",
                  targetTenant: context.tenantId || "",
                  userTenant: userTenant || "",
                },
                tenantId: (context.tenantId as DatabaseId) || null,
              });
            })
            .catch((err) => {
              logger.error("Failed to write audit log for tenant bypass", { error: err });
            });
        }
      }

      // Build base filter
      const filter: Record<string, any> = { ...filterOverride };

      if (isMultiTenant && context.tenantId) {
        filter.tenantId = context.tenantId;
      }

      // Use crud.findMany to query media collection
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
    mediaImages: (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      fetchMedia(MEDIA_FILTERS.images, args.pagination, context),
    mediaDocuments: (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      fetchMedia(MEDIA_FILTERS.documents, args.pagination, context),
    mediaAudio: (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      fetchMedia(MEDIA_FILTERS.audio, args.pagination, context),
    mediaVideos: (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      fetchMedia(MEDIA_FILTERS.videos, args.pagination, context),
    mediaRemote: (_: MediaResolverParent, args: PaginationArgs, context: GraphQLContext) =>
      fetchMedia(MEDIA_FILTERS.remote, args.pagination, context),
  };
}
