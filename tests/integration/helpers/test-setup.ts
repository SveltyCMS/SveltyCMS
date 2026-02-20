/**
 * @file tests/integration/helpers/testSetup.ts
 * @description
 * High-level orchestration for integration test environments.
 * Follows strict black-box principles using the /api/testing endpoint.
 */

import { getApiBaseUrl } from './server';

const API_BASE_URL = getApiBaseUrl();

/**
 * Test fixtures for reusing test data across tests
 */
export const testFixtures = {
	users: {
		admin: {
			email: 'admin@test.com',
			password: 'Test123!',
			username: 'admin',
			role: 'admin'
		},
		developer: {
			email: 'developer@test.com',
			password: 'Test123!',
			username: 'developer',
			role: 'developer'
		},
		editor: {
			email: 'editor@test.com',
			password: 'Test123!',
			username: 'editor',
			role: 'editor'
		}
	},
	adminUser: {
		email: 'admin@test.com',
		password: 'Test123!',
		username: 'admin',
		role: 'admin'
	},
	developerUser: {
		email: 'developer@test.com',
		password: 'Test123!',
		username: 'developer',
		role: 'developer'
	},
	editorUser: {
		email: 'editor@test.com',
		password: 'Test123!',
		username: 'editor',
		role: 'editor'
	}
};

/**
 * Resets the database to a clean state and seeds default fixtures.
 */
export async function cleanupTestDatabase(): Promise<void> {
	console.log('🧹 Cleaning up test database...');
	const response = await fetch(`${API_BASE_URL}/api/testing`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'reset' })
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to reset database: ${error}`);
	}
}

/**
 * Prepares a clean environment and returns an authenticated session cookie.
 */
export async function prepareAuthenticatedContext(): Promise<string> {
	// 1. Reset database
	await cleanupTestDatabase();

	// 2. Seed database
	console.log('🌱 Seeding test database...');
	const seedResp = await fetch(`${API_BASE_URL}/api/testing`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'seed',
			email: testFixtures.adminUser.email,
			password: testFixtures.adminUser.password
		})
	});

	if (!seedResp.ok) {
		throw new Error('Failed to seed database');
	}

	// 3. Login as admin
	console.log('🔑 Logging in as admin...');
	const loginResp = await fetch(`${API_BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: testFixtures.adminUser.email,
			password: testFixtures.adminUser.password
		})
	});

	if (!loginResp.ok) {
		throw new Error('Login failed');
	}

	const setCookie = loginResp.headers.get('set-cookie');
	if (!setCookie) {
		throw new Error('No session cookie returned');
	}

	// Return the cookie string (often includes more than just the session ID)
	return setCookie;
}

/**
 * Compatibility alias for older tests.
 */
export async function initializeTestEnvironment(): Promise<void> {
	await cleanupTestDatabase();
}

/**
 * Compatibility alias for older tests.
 */
export async function cleanupTestEnvironment(): Promise<void> {
	await cleanupTestDatabase();
}
