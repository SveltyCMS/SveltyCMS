/**
 * @file src/routes/api/graphql/resolvers/system.ts
 * @description System-level GraphQL resolvers for health, diagnostics, navigation, and collection stats.
 */

import { contentSystem } from "@src/content";
import type { User } from "@src/databases/auth/types";
import { logger } from "@utils/logger.server";

interface GraphQLContext {
  locale?: string;
  tenantId?: string | null;
  user?: User;
}

export const systemTypeDefs = `
	input NavigationOptions {
		maxDepth: Int = 1
		expandedIds: [String!]
	}

	type CollectionStats {
		_id: String!
		name: String!
		icon: String
		path: String
		fieldCount: Int!
		hasRevisions: Boolean!
		hasLivePreview: Boolean!
		status: String
	}

	type NavigationNode {
		_id: String!
		name: String!
		path: String
		icon: String
		nodeType: String!
		order: Int
		parentId: String
		children: [NavigationNode!]
		hasChildren: Boolean
	}

	type BreadcrumbItem {
		name: String!
		path: String!
	}

	type contentSystemHealth {
		state: String!
		nodeCount: Int!
		collectionCount: Int!
		cacheAge: Int
		version: Float!
	}

	type HealthMaps {
		contentNodes: Int!
		pathLookup: Int!
	}

	type HealthCache {
		hasFirstCollection: Boolean!
		cacheAge: Int
		tenantId: String
	}

	type contentSystemDiagnostics {
		maps: HealthMaps!
		cache: HealthCache!
		state: String!
		version: Float!
	}

	type OperationCounts {
		create: Int!
		update: Int!
		delete: Int!
		move: Int!
	}

	type contentSystemMetrics {
		initializationTime: Float!
		cacheHits: Int!
		cacheMisses: Int!
		lastRefresh: Float!
		operationCounts: OperationCounts!
		uptime: Float!
		cacheHitRate: Float!
	}

	type StructureValidation {
		valid: Boolean!
		errors: [String!]!
		warnings: [String!]!
	}

	extend type Query {
		collectionStats(collectionId: String!): CollectionStats
		allCollectionStats: [CollectionStats!]!
		navigationStructure(options: NavigationOptions): [NavigationNode!]!
		nodeChildren(nodeId: String!): [NavigationNode!]!
		breadcrumb(path: String!): [BreadcrumbItem!]!
		contentSystemHealth: contentSystemHealth
		contentSystemDiagnostics: contentSystemDiagnostics
		contentSystemMetrics: contentSystemMetrics
		validateContentStructure: StructureValidation
	}
`;

export const systemResolvers = {
  Query: {
    // --- Collection Metadata ---
    collectionStats: async (
      _: unknown,
      args: { collectionId: string },
      context: GraphQLContext,
    ) => {
      if (!context.user) {
        throw new Error("Authentication required");
      }
      try {
        return await contentSystem.getCollectionStats(args.collectionId, context.tenantId);
      } catch (error) {
        logger.error("Error in collectionStats:", {
          error,
          collectionId: args.collectionId,
          tenantId: context.tenantId,
        });
        throw new Error("Failed to fetch collection stats");
      }
    },

    allCollectionStats: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error("Authentication required");
      }
      try {
        const collections = await contentSystem.getCollections(context.tenantId);
        // Optimize: Use the collection definitions we already have instead of re-resolving each one
        return collections.map((col) => {
          return {
            _id: col._id,
            name: col.name,
            icon: col.icon || "mdi:folder",
            path: col.path || `/collection/${col.name}`,
            fieldCount: (col.fields || []).length,
            hasRevisions: col.revision || false,
            hasLivePreview: !!col.livePreview,
            status: col.status || "active",
          };
        });
      } catch (error) {
        logger.error("Error in allCollectionStats:", {
          error,
          tenantId: context.tenantId,
        });
        throw new Error("Failed to fetch all collection stats");
      }
    },

    // --- Navigation ---
    navigationStructure: async (
      _: unknown,
      args: { options?: { maxDepth?: number; expandedIds?: string[] } },
      context: GraphQLContext,
    ) => {
      if (!context.user) {
        throw new Error("Authentication required");
      }
      try {
        const expandedIds = new Set(args.options?.expandedIds || []);
        return await contentSystem.getNavigationStructureProgressive({
          maxDepth: args.options?.maxDepth ?? 1,
          expandedIds,
          tenantId: context.tenantId,
        });
      } catch (error) {
        logger.error("Error in navigationStructure:", {
          error,
          tenantId: context.tenantId,
        });
        throw new Error("Failed to fetch navigation structure");
      }
    },

    nodeChildren: async (_: unknown, args: { nodeId: string }, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error("Authentication required");
      }
      try {
        return await contentSystem.getNodeChildren(args.nodeId, context.tenantId);
      } catch (error) {
        logger.error("Error in nodeChildren:", {
          error,
          nodeId: args.nodeId,
          tenantId: context.tenantId,
        });
        throw new Error("Failed to fetch node children");
      }
    },

    breadcrumb: async (_: unknown, args: { path: string }, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error("Authentication required");
      }
      try {
        return await contentSystem.getBreadcrumb(args.path);
      } catch (error) {
        logger.error("Error in breadcrumb:", {
          error,
          path: args.path,
          tenantId: context.tenantId,
        });
        throw new Error("Failed to fetch breadcrumb");
      }
    },

    // --- Health & Diagnostics ---
    contentSystemHealth: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error("Authentication required");
      }
      try {
        return await contentSystem.getHealthStatus();
      } catch (error) {
        logger.error("Error in contentSystemHealth:", { error });
        throw new Error("Failed to fetch health status");
      }
    },

    contentSystemDiagnostics: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user?.isAdmin) {
        throw new Error("Admin access required");
      }
      try {
        return await contentSystem.getDiagnostics();
      } catch (error) {
        logger.error("Error in contentSystemDiagnostics:", { error });
        throw new Error("Failed to fetch diagnostics");
      }
    },

    contentSystemMetrics: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user?.isAdmin) {
        throw new Error("Admin access required");
      }
      try {
        return await contentSystem.getMetrics();
      } catch (error) {
        logger.error("Error in contentSystemMetrics:", { error });
        throw new Error("Failed to fetch metrics");
      }
    },

    validateContentStructure: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user?.isAdmin) {
        throw new Error("Admin access required");
      }
      try {
        return await contentSystem.validateStructure();
      } catch (error) {
        logger.error("Error in validateContentStructure:", { error });
        throw new Error("Failed to validate structure");
      }
    },
  },
};
