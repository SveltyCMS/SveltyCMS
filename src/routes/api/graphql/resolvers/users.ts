// System Logs
import { logger } from '@src/utils/logger';

import type { dbInterface } from '@src/routes/api/databases/dbInterface';
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
			return 'Int';
		case 'object':
			return value instanceof Date ? 'String' : 'String';
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
				logger.error('Error fetching users:', error as Error);
				throw new Error('Failed to fetch users');
			}
		}
	};
}
