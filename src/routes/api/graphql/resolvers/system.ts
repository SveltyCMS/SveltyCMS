/**
 * @file src/routes/api/graphql/resolvers/system.ts
 * @description System-level GraphQL resolvers for health, diagnostics, navigation, and collection stats.
 */

import { contentManager } from '@src/content/ContentManager';
import type { User } from '@src/databases/auth/types';

interface GraphQLContext {
	user?: User;
	tenantId?: string;
	locale?: string;
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

	type ContentManagerHealth {
		state: String!
		nodeCount: Int!
		collectionCount: Int!
		cacheAge: Int
		version: Int!
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

	type ContentManagerDiagnostics {
		maps: HealthMaps!
		cache: HealthCache!
		state: String!
		version: Int!
	}

	type OperationCounts {
		create: Int!
		update: Int!
		delete: Int!
		move: Int!
	}

	type ContentManagerMetrics {
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
`;

export const systemResolvers = {
	Query: {
		// --- Collection Metadata ---
		collectionStats: async (_: unknown, args: { collectionId: string }, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');
			return contentManager.getCollectionStats(args.collectionId, context.tenantId);
		},

		allCollectionStats: async (_: unknown, __: unknown, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');
			const collections = await contentManager.getCollections(context.tenantId);
			return collections.map((col) => contentManager.getCollectionStats(col._id!, context.tenantId)).filter(Boolean);
		},

		// --- Navigation ---
		navigationStructure: async (_: unknown, args: { options?: { maxDepth?: number; expandedIds?: string[] } }, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');
			const expandedIds = new Set(args.options?.expandedIds || []);
			return contentManager.getNavigationStructureProgressive({
				maxDepth: args.options?.maxDepth ?? 1,
				expandedIds,
				tenantId: context.tenantId
			});
		},

		nodeChildren: async (_: unknown, args: { nodeId: string }, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');
			return contentManager.getNodeChildren(args.nodeId, context.tenantId);
		},

		breadcrumb: async (_: unknown, args: { path: string }, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');
			return contentManager.getBreadcrumb(args.path);
		},

		// --- Health & Diagnostics ---
		contentManagerHealth: async (_: unknown, __: unknown, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');
			return contentManager.getHealthStatus();
		},

		contentManagerDiagnostics: async (_: unknown, __: unknown, context: GraphQLContext) => {
			if (!context.user || !context.user.isAdmin) throw new Error('Admin access required');
			return contentManager.getDiagnostics();
		},

		contentManagerMetrics: async (_: unknown, __: unknown, context: GraphQLContext) => {
			if (!context.user || !context.user.isAdmin) throw new Error('Admin access required');
			return contentManager.getMetrics();
		},

		validateContentStructure: async (_: unknown, __: unknown, context: GraphQLContext) => {
			if (!context.user || !context.user.isAdmin) throw new Error('Admin access required');
			return contentManager.validateStructure();
		}
	}
};
