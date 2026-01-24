// @ts-ignore
/**
 * @file tests/bun/helpers/testSetup.ts
 * @description Static test data and environment initialization with SAFETY GUARDS.
 */
import { waitForServer } from './server';
import { createTestUsers, loginAsAdmin } from './auth';
import { testUsers } from '../../fixtures/users';

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
 * 
 * IMPORTANT: When running setup tests as part of integration test workflow,
 * we SKIP cleanup to preserve the admin user and config for subsequent tests.
 */
export async function cleanupTestDatabase(): Promise<void> {
	console.log('[cleanupTestDatabase] Starting...');
	
	// Skip cleanup when running in integration test mode
	// This allows setup tests to create admin user and config that persists
	if (process.env.SKIP_DB_CLEANUP === 'true') {
		console.log('[cleanupTestDatabase] Skipping cleanup (SKIP_DB_CLEANUP=true)');
		return;
	}
	
	const dbType = process.env.DB_TYPE || 'mongodb';
	
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
			// await fs.unlink(path.join(configDir, 'private.test.ts')).catch(() => {});
		}
		// Also clean private.ts if we are in a safe environment (extra safety: only if TEST_MODE is explicitly set)
		if (process.env.TEST_MODE) {
			await fs.unlink(path.join(configDir, 'private.ts')).catch(() => {});
		}
	} catch (e) {
		// Ignore
	}

	// 3. Drop Test Database
	// Note: Only works for MongoDB currently
	if (dbType !== 'mongodb') {
		console.log(`[cleanupTestDatabase] Skipping DB drop for ${dbType} (not implemented)`);
		return;
	}

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

	console.log('[cleanupTestDatabase] Connecting to MongoDB (URI redacted)...');
	const client = new MongoClient(uri, {
		serverSelectionTimeoutMS: 5000
	});
	try {
		await client.connect();
		console.log('[cleanupTestDatabase] Connected. Dropping DB...');
		await client.db(dbName).dropDatabase();
		console.log('[cleanupTestDatabase] DB Dropped.');
	} catch (e) {
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
		const adminRole = await db.collection('roles').findOne({ _id: 'admin' });
		if (!adminRole) {
			console.log('[testSetup] Seeding admin role...');
			// Hardcode commonly used permissions + 'admin' catch-all
			// This avoids needing to import system internals
			const permissions = ['read', 'write', 'delete', 'admin'];
			await db.collection('roles').insertOne({
				_id: 'admin',
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
	} catch (e) {
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
	} catch (e) {
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
 * @deprecated Use testUsers from '@tests/fixtures/users' instead
 */
export const testFixtures = {
	users: testUsers
};
