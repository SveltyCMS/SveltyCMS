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
import logger from '@src/utils/logger';

// Types
import type { dbInterface } from '@src/databases/dbInterface';
import type { User } from '@src/auth/types';

// Helper function to map TypeScript types to GraphQL types
function mapTypeToGraphQLType(value: any): string {
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
function generateGraphQLTypeDefsFromType<T extends Record<string, any>>(type: T, typeName: string): string {
	const fields = Object.entries(type)
		.map(([key, value]) => `${key}: ${mapTypeToGraphQLType(value)}`)
		.join('\n');

	return `
        type ${typeName} {
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

// Resolvers
export function userResolvers(dbAdapter: dbInterface) {
	return {
		users: async () => {
			logger.info('Fetching users from the database');
			try {
				const users = await dbAdapter.findMany('auth_users', {});
				logger.info('Users retrieved successfully', { count: users.length });
				return users;
			} catch (error) {
				logger.error('Error fetching users:', { error: error instanceof Error ? error.message : String(error) });
				throw new Error('Failed to fetch users');
			}
		}
	};
}
