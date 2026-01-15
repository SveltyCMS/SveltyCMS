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
	console.log('[cleanupTestDatabase] Starting...');
	// 1. Call reset endpoint to clear config and cache on the server
	try {
		const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';
		console.log('[cleanupTestDatabase] Calling reset endpoint:', API_BASE_URL);
		await fetch(`${API_BASE_URL}/api/setup/reset`, { method: 'POST' });
		console.log('[cleanupTestDatabase] Reset endpoint called');
	} catch (e) {
		// Ignore connection errors if server is down
		console.log('[cleanupTestDatabase] Reset endpoint failed (ignored):', e);
	}

	// 2. Hard delete config files (double safety for local runner)
	const fs = await import('fs/promises');
	const path = await import('path');
	const configDir = path.resolve(process.cwd(), 'config');

	try {
		if (process.env.TEST_MODE) {
			await fs.unlink(path.join(configDir, 'private.test.ts')).catch(() => {});
		}
		// Also clean private.ts if we are in a safe environment (extra safety: only if TEST_MODE is explicitly set)
		if (process.env.TEST_MODE) {
			await fs.unlink(path.join(configDir, 'private.ts')).catch(() => {});
		}
	} catch (e) {
		// Ignore
	}

	// 3. Drop Test Database
	// Note: basic drop logic, ideally use common DB helper if available
	const { MongoClient } = await import('mongodb');
	const dbName = process.env.DB_NAME || 'sveltycms_test';

	let uri = process.env.MONGODB_URI;
	if (!uri && process.env.DB_USER && process.env.DB_PASSWORD) {
		const host = process.env.DB_HOST || 'localhost';
		const port = process.env.DB_PORT || '27017';
		uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${host}:${port}/${dbName}?authSource=admin`;
	}
	if (!uri) {
		const host = process.env.DB_HOST || '127.0.0.1';
		const port = process.env.DB_PORT || '27017';
		uri = `mongodb://${host}:${port}/${dbName}`;
	}

	// Force hardcoded URI to rule out Env var issues - REMOVED, using generated URI with directConnection
	// uri = `mongodb://127.0.0.1:27017/${dbName}`;

	console.log('[cleanupTestDatabase] Connecting to DB (URI redacted)...');
	const client = new MongoClient(uri, {
		serverSelectionTimeoutMS: 5000,
		directConnection: true,
		family: 4
	});
	try {
		await client.connect();
		console.log('[cleanupTestDatabase] Connected. Dropping DB...');
		await client.db(dbName).dropDatabase();
		console.log('[cleanupTestDatabase] DB Dropped.');
	} catch (e) {
		console.error('Failed to drop test database:', e);
	} finally {
		await client.close();
		console.log('[cleanupTestDatabase] Client closed.');
	}
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
			email: 'admin@example.com',
			password: 'Admin123!',
			confirmPassword: 'Admin123!',
			role: 'admin'
		},
		firstAdmin: {
			username: 'admin',
			email: 'admin@example.com',
			password: 'Admin123!',
			confirmPassword: 'Admin123!',
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
		},
		viewer: {
			username: 'viewer',
			email: 'viewer@example.com',
			password: 'ViewerPassword123!',
			confirmPassword: 'ViewerPassword123!',
			role: 'viewer'
		}
	}
};
