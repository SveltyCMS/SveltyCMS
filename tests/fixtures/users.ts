/**
 * @file tests/fixtures/users.ts
 * @description Centralized test user fixtures for all tests
 * 
 * This file provides a single source of truth for test user credentials,
 * ensuring consistency across unit tests, integration tests, and E2E tests.
 */

export interface TestUser {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
	role: string;
}

/**
 * Test user fixtures - shared across all test types
 * 
 * Usage:
 * ```typescript
 * import { testUsers } from '@tests/fixtures/users';
 * 
 * // In tests
 * await login(testUsers.admin.email, testUsers.admin.password);
 * ```
 */
export const testUsers = {
	admin: {
		username: 'admin',
		email: 'admin@example.com',
		password: 'Admin123!',
		confirmPassword: 'Admin123!',
		role: 'admin'
	},
	developer: {
		username: 'developer',
		email: 'developer@example.com',
		password: 'Developer123!',
		confirmPassword: 'Developer123!',
		role: 'developer'
	},
	editor: {
		username: 'editor',
		email: 'editor@example.com',
		password: 'Editor123!',
		confirmPassword: 'Editor123!',
		role: 'editor'
	},
	viewer: {
		username: 'viewer',
		email: 'viewer@example.com',
		password: 'ViewerPassword123!',
		confirmPassword: 'ViewerPassword123!',
		role: 'viewer'
	}
} as const satisfies Record<string, TestUser>;

/**
 * Array of all test users for iteration
 */
export const allTestUsers = Object.values(testUsers);

/**
 * Get test user by role
 */
export function getTestUserByRole(role: string): TestUser | undefined {
	return allTestUsers.find((user) => user.role === role);
}
