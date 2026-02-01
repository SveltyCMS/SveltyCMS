/**
 * @file src/routes/api/graphql/resolvers/users.ts
 * @description GraphQL type definitions and resolvers for user-related queries.
 */

import { getPrivateSettingSync } from '@src/services/settingsService';
import type { ISODateString } from '@src/databases/dbInterface';
import { logger } from '@utils/logger.server';
import type { DatabaseAdapter } from '@src/databases/dbInterface';
import type { User } from '@src/databases/auth/types';

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
	tenantId: '',
	password: '',
	role: '',
	username: '',
	avatar: '',
	lastAuthMethod: '',
	lastActiveAt: new Date().toISOString() as ISODateString,
	expiresAt: new Date().toISOString() as ISODateString,
	isRegistered: false,
	blocked: false,
	resetRequestedAt: new Date().toISOString() as ISODateString,
	resetToken: '',
	failedAttempts: 0,
	lockoutUntil: new Date().toISOString() as ISODateString,
	is2FAEnabled: false,
	permissions: []
};

// TypeDefs
export function userTypeDefs() {
	return generateGraphQLTypeDefsFromType(userTypeSample as Record<string, GraphQLValue>, 'User');
}

interface GraphQLContext {
	user?: User;
	tenantId?: string;
}

// Resolvers with pagination support and validation
export function userResolvers(dbAdapter: DatabaseAdapter) {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}

	return {
		users: async (_: unknown, args: { pagination?: { page?: number; limit?: number } }, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');

			const { page = 1, limit = 10 } = args.pagination || {};

			try {
				// Build filter for multi-tenant support
				const filter: Record<string, unknown> = {};
				if (getPrivateSettingSync('MULTI_TENANT') && context.tenantId) {
					filter.tenantId = context.tenantId;
				}

				// Use auth.getAllUsers instead of queryBuilder for proper model access
				const result = await dbAdapter.auth.getAllUsers({
					filter,
					sort: { field: 'updatedAt', order: 'desc' },
					page,
					limit
				});

				if (!result.success) {
					throw new Error(result.error?.message || 'Query failed');
				}

				return result.data || [];
			} catch (error) {
				logger.error('Error fetching users:', {
					error: error instanceof Error ? error.message : String(error),
					tenantId: context.tenantId
				});
				throw new Error('Failed to fetch users');
			}
		},
		me: async (_: unknown, __: unknown, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');
			return context.user;
		}
	};
}
