/**
 * @file src/routes/api/graphql/resolvers/users.ts
 * @description GraphQL type definitions and resolvers for user-related queries.
 */

import { getPrivateSettingSync } from '@shared/services/settingsService';
import type { ISODateString, BaseEntity } from '@shared/database/dbInterface';
import { logger } from '@shared/utils/logger.server';
import type { DatabaseAdapter } from '@shared/database/dbInterface';
import type { User } from '@shared/database/auth/types';

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

interface UserEntity extends BaseEntity {
	email?: string;
	tenantId?: string;
}

// Resolvers with pagination support and validation
export function userResolvers(dbAdapter: DatabaseAdapter) {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}

	const fetchWithPagination = async (contentTypes: string, pagination: { page: number; limit: number }, context: GraphQLContext) => {
		if (!context.user) throw new Error('Authentication required');

		if (getPrivateSettingSync('MULTI_TENANT') && !context.tenantId) {
			throw new Error('Internal Server Error: Tenant context is missing.');
		}

		const { page = 1, limit = 10 } = pagination || {};

		try {
			// Tenant query
			const query: Partial<UserEntity> = {};
			if (getPrivateSettingSync('MULTI_TENANT')) {
				query.tenantId = context.tenantId;
			}

			const result = await dbAdapter
				.queryBuilder<UserEntity>(contentTypes)
				.where(query)
				.sort('updatedAt', 'desc')
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
		users: async (_: unknown, args: { pagination: { page: number; limit: number } }, context: GraphQLContext) =>
			await fetchWithPagination('auth_users', args.pagination, context),
		me: async (_: unknown, __: unknown, context: GraphQLContext) => {
			if (!context.user) throw new Error('Authentication required');
			return context.user;
		}
	};
}
