// @ts-ignore
/**
 * @file tests/bun/helpers/testSetup.ts
 * @description Static test data and environment initialization with SAFETY GUARDS.
 */
import { waitForServer } from './server';
import { createTestUsers, loginAsAdmin } from './auth';

/**
 * Initialize the environment (wait for server).
 */
export async function initializeTestEnvironment(): Promise<void> {
	await waitForServer();
}

/**
 * Cleanup the test environment (placeholder for now).
 */
export async function cleanupTestEnvironment(): Promise<void> {
	// Logic for cleaning up after tests
}

/**
 * Cleanup the test database (placeholder for now).
 */
export async function cleanupTestDatabase(): Promise<void> {
	// Logic for cleaning up the database
}

/**
 * Prepare an authenticated context (login as admin).
 * @returns {Promise<string>} Authentication cookie.
 */
export async function prepareAuthenticatedContext(): Promise<string> {
	// 1. Create standard test users (idempotent)
	await createTestUsers();

	// 2. Perform login
	const cookie = await loginAsAdmin();

	if (!cookie) {
		throw new Error('FAILED to get admin authentication cookie!');
	}

	return cookie;
}

/**
 * Common test data (fixtures).
 */
export const testFixtures = {
	users: {
		admin: {
			username: 'admin',
			email: 'admin@test.com',
			password: 'AdminPassword123!',
			confirmPassword: 'AdminPassword123!',
			role: 'admin'
		},
		firstAdmin: {
			username: 'admin',
			email: 'admin@test.com',
			password: 'AdminPassword123!',
			confirmPassword: 'AdminPassword123!',
			role: 'admin'
		},
		editor: {
			username: 'editor',
			email: 'editor@test.com',
			password: 'EditorPassword123!',
			confirmPassword: 'EditorPassword123!',
			role: 'editor'
		},
		secondUser: {
			username: 'editor',
			email: 'editor@test.com',
			password: 'EditorPassword123!',
			confirmPassword: 'EditorPassword123!',
			role: 'editor'
		}
	}
};
