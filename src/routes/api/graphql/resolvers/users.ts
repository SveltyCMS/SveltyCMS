/**
 * @file src/routes/api/graphql/resolvers/users.ts
 * @description GraphQL type definitions and resolvers for user-related queries.
 *
 * This module provides:
 * - Dynamic generation of GraphQL type definitions based on User type
 * - Resolver function to fetch user data from the database
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

// System Logger
import { logger } from '@utils/logger.svelte';

// Permissions
import { checkApiPermission } from '@api/permissions';

// Types
import type { dbInterface } from '@src/databases/dbInterface';
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

// Resolvers with pagination support
export function userResolvers(dbAdapter: dbInterface) {
	const fetchWithPagination = async (contentTypes: string, pagination: { page: number; limit: number }, context: { user?: User }) => {
		// Check user permissions - only users with user management permissions should see user data
		if (!context.user) {
			logger.warn(`GraphQL: No user in context for ${contentTypes}`);
			throw new Error('Authentication required');
		}

		const permissionResult = await checkApiPermission(context.user, {
			resource: 'users',
			action: 'read'
		});

		if (!permissionResult.hasPermission) {
			logger.warn(`GraphQL: User ${context.user._id} denied access to ${contentTypes}`);
			throw new Error(`Access denied: ${permissionResult.error || 'Insufficient permissions for user data access'}`);
		}

		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw Error('Database adapter is not initialized');
		}

		const { page = 1, limit = 10 } = pagination || {};
		const skip = (page - 1) * limit;

		try {
			const users = await dbAdapter.findMany(contentTypes, {}, { sort: { lastActiveAt: -1 }, skip, limit });
			logger.info(`Fetched ${contentTypes}`, { count: users.length });
			return users;
		} catch (error) {
			logger.error(`Error fetching data for ${contentTypes}:`, error);
			throw Error(`Failed to fetch data for ${contentTypes}`);
		}
	};

	return {
		users: async (_: unknown, args: { pagination: { page: number; limit: number } }, context: { user?: User }) =>
			await fetchWithPagination('auth_users', args.pagination, context)
	};
}
