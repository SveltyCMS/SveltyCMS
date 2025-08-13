/**
 * @file src/routes/api/graphql/resolvers/users.ts
 * @description GraphQL type definitions and resolvers for user-related queries.
 *
 * This module provides:
 * - Dynamic generation of GraphQL type definitions based on User type
 * - Resolver function to fetch user data from the database, scoped to the current tenant
 *
 * Features:
 * - Automatic mapping of TypeScript types to GraphQL types
 * - Dynamic generation of User type definition
 * - Integration with database adapter for user data retrieval
 * - Error handling and logging
 *
 * Usage:
 * - Used in the main GraphQL setup to include user-related schema and resolver
 * - Allows querying of user data through the GraphQL API
 */

import { privateEnv } from '@root/config/private';
// System Logger
import { logger } from '@utils/logger.svelte';

// Permissions

// Types
import type { DatabaseAdapter } from '@src/databases/dbInterface';
import type { User } from '@src/auth/types';

// GraphQL types
type GraphQLValue = string | number | boolean | Date | object | GraphQLValue[];

// Helper function to map TypeScript types to GraphQL types
function mapTypeToGraphQLType(value: GraphQLValue): string {
	if (Array.isArray(value)) {
		return `[${mapTypeToGraphQLType(value[0])}]`;
	}
	switch (typeof value) {
		case 'string':
			return 'String';
		case 'boolean':
			return 'Boolean';
		case 'number':
			return Number.isInteger(value) ? 'Int' : 'Float';
		case 'object':
			return value instanceof Date ? 'String' : 'JSON';
		default:
			return 'String';
	}
}

// Helper function to generate GraphQL type definitions from a TypeScript type
function generateGraphQLTypeDefsFromType<T extends Record<string, GraphQLValue>>(type: T, typeID: string): string {
	const fields = Object.entries(type)
		.map(([key, value]) => `${key}: ${mapTypeToGraphQLType(value)}`)
		.join('\n');

	return `
        type ${typeID} {
            ${fields}
        }
    `;
}

// Use a partial User object to define the types
const userTypeSample: Partial<User> = {
	_id: '',
	email: '',
	tenantId: '', // Add tenantId for multi-tenancy
	password: '',
	role: '',
	username: '',
	avatar: '',
	lastAuthMethod: '',
	lastActiveAt: new Date(),
	expiresAt: new Date(),
	isRegistered: false,
	blocked: false,
	resetRequestedAt: new Date(),
	resetToken: '',
	failedAttempts: 0,
	lockoutUntil: new Date(),
	is2FAEnabled: false,
	permissions: []
};

// TypeDefs
export function userTypeDefs() {
	return generateGraphQLTypeDefsFromType(userTypeSample, 'User');
}

// GraphQL context type
interface GraphQLContext {
	user?: User;
	tenantId?: string;
}

// Resolvers with pagination support
export function userResolvers(dbAdapter: DatabaseAdapter) {
	const fetchWithPagination = async (contentTypes: string, pagination: { page: number; limit: number }, context: GraphQLContext) => {
		// Authentication is handled by hooks.server.ts
		if (!context.user) {
			throw new Error('Authentication required');
		}

		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw Error('Database adapter is not initialized');
		}

		if (privateEnv.MULTI_TENANT && !context.tenantId) {
			logger.error('GraphQL: Tenant ID is missing from context in a multi-tenant setup.');
			throw new Error('Internal Server Error: Tenant context is missing.');
		}

		const { page = 1, limit = 10 } = pagination || {};

		try {
			// --- MULTI-TENANCY: Scope the query by tenantId ---
			const query: { tenantId?: string } = {};
			if (privateEnv.MULTI_TENANT) {
				query.tenantId = context.tenantId;
			}

			// Use query builder pattern consistent with REST API
			const queryBuilder = dbAdapter.queryBuilder(contentTypes).where(query).sort('lastActiveAt', 'desc').paginate({ page, pageSize: limit });

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
		users: async (_: unknown, args: { pagination: { page: number; limit: number } }, context: GraphQLContext) =>
			await fetchWithPagination('auth_users', args.pagination, context)
	};
}
