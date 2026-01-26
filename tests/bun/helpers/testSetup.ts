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
	} catch (e: any) {
		// Ignore connection errors if server is down
		console.log('[cleanupTestDatabase] Reset endpoint failed (ignored):', e);
	}

	// 3. Drop Test Database
	// Note: basic drop logic, ideally use common DB helper if available
	const { MongoClient } = await import('mongodb');
	const dbName = process.env.DB_NAME || 'sveltycms_test';

	let uri = process.env.MONGODB_URI;
	if (!uri && process.env.DB_USER && process.env.DB_PASSWORD) {
		let host = process.env.DB_HOST || 'localhost';
		if (host === 'localhost') host = '127.0.0.1'; // Avoid DNS issues
		const port = process.env.DB_PORT || '27017';
		uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${host}:${port}/${dbName}?authSource=admin`;
	}
	if (!uri) {
		let host = process.env.DB_HOST || '127.0.0.1';
		if (host === 'localhost') host = '127.0.0.1';
		const port = process.env.DB_PORT || '27017';
		uri = `mongodb://${host}:${port}/${dbName}`;
	}

	// Force hardcoded URI to rule out Env var issues - REMOVED, using generated URI with directConnection
	// uri = `mongodb://127.0.0.1:27017/${dbName}`;

	const client = new MongoClient(uri, {
		serverSelectionTimeoutMS: 5000
	});
	try {
		await client.connect();
		console.log('[cleanupTestDatabase] Connected. Dropping DB...');
		await client.db(dbName).dropDatabase();
		console.log('[cleanupTestDatabase] DB Dropped.');
	} catch (e: any) {
		console.warn('Warning: Failed to drop test database (non-fatal):', e.message);
	} finally {
		await client.close();
		console.log('[cleanupTestDatabase] Client closed.');
	}
}

/**
 * Seeds basic roles into the database to ensure permissions exist.
 * This mimics what the Setup API does but faster/direct for tests.
 */
async function seedBasicRoles(): Promise<void> {
	const { MongoClient } = await import('mongodb');
	const dbName = process.env.DB_NAME || 'sveltycms_test';

	// Construct URI (reuse logic from cleanup)
	let uri = process.env.MONGODB_URI;
	if (!uri && process.env.DB_USER && process.env.DB_PASSWORD) {
		let host = process.env.DB_HOST || '127.0.0.1';
		if (host === 'localhost') host = '127.0.0.1';
		const port = process.env.DB_PORT || '27017';
		uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${host}:${port}/${dbName}?authSource=admin`;
	} else if (!uri) {
		let host = process.env.DB_HOST || '127.0.0.1';
		if (host === 'localhost') host = '127.0.0.1';
		const port = process.env.DB_PORT || '27017';
		uri = `mongodb://${host}:${port}/${dbName}`;
	}

	const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
	try {
		await client.connect();
		const db = client.db(dbName);

		// Check if admin role exists
		const adminRole = await db.collection('auth_roles').findOne({ _id: 'admin' } as any);
		if (!adminRole) {
			console.log('[testSetup] Seeding admin role...');
			// Hardcode commonly used permissions + 'admin' catch-all
			// This avoids needing to import system internals
			const permissions = ['read', 'write', 'delete', 'admin'];
			await db.collection('auth_roles').insertOne({
				_id: 'admin' as any,
				name: 'Admin',
				description: 'System Administrator',
				permissions,
				isAdmin: true,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}

		// Seed settings
		await seedBasicSettings(db);
	} catch (e: any) {
		console.warn('Warning: Failed to seed data:', e.message);
	} finally {
		await client.close();
	}
}

async function seedBasicSettings(db: any): Promise<void> {
	try {
		const existingconfig = await db.collection('system_settings').findOne({ key: 'SITE_NAME' });
		if (!existingconfig) {
			console.log('[testSetup] Seeding basic settings...');
			const crypto = await import('crypto');
			const now = new Date();
			const settings = [
				{
					_id: crypto.randomUUID(),
					key: 'SITE_NAME',
					value: 'SveltyCMS Test',
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				},
				{
					_id: crypto.randomUUID(),
					key: 'HOST_DEV',
					value: 'http://localhost:4173',
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				},
				{
					_id: crypto.randomUUID(),
					key: 'DEFAULT_CONTENT_LANGUAGE',
					value: 'en',
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				},
				{
					_id: crypto.randomUUID(),
					key: 'DEFAULT_THEME_IS_DEFAULT',
					value: true,
					category: 'public',
					scope: 'system',
					isGlobal: true,
					createdAt: now,
					updatedAt: now
				}
			];
			await db.collection('system_settings').insertMany(settings);
		}
	} catch (e: any) {
		console.warn('Warning: Failed to seed settings:', e.message);
	}
}

/**
 * Prepare an authenticated context (login as admin).
 * @returns {Promise<string>} Authentication cookie.
 */
export async function prepareAuthenticatedContext(): Promise<string> {
	// 0. Ensure Roles and Settings exist (since DB might be clean)
	await seedBasicRoles();

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
