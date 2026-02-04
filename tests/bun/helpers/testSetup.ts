// @ts-ignore
/**
 * @file tests/bun/helpers/testSetup.ts
 * @description Static test data and environment initialization with SAFETY GUARDS.
 */
import { waitForServer } from './server';
import { createTestUsers, loginAsAdmin } from './auth';

// Re-export isServerAvailable for easy access from tests
export { isServerAvailable } from './server';

/**
 * Initialize the environment (wait for server).
 * @returns true if server is available, false otherwise
 */
export async function initializeTestEnvironment(): Promise<boolean> {
	return await waitForServer();
}

// Cleanup the test environment (placeholder for now).
export async function cleanupTestEnvironment(): Promise<void> {
	// Logic for cleaning up after tests
}

// Cleanup the test database (placeholder for now).
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

		// Seed admin user if not exists
		await seedAdminUser(db);

		// Seed settings
		await seedBasicSettings(db);

		// Seed default theme
		await seedDefaultTheme(db);
	} catch (e: any) {
		console.warn('Warning: Failed to seed data:', e.message);
	} finally {
		await client.close();
	}
}

/**
 * Seeds the admin user with a properly hashed password.
 * This allows tests to authenticate without going through the setup API.
 */
async function seedAdminUser(db: any): Promise<void> {
	try {
		const existingAdmin = await db.collection('auth_users').findOne({ email: 'admin@example.com' });
		if (!existingAdmin) {
			console.log('[testSetup] Seeding admin user...');
			const argon2 = await import('argon2');
			const crypto = await import('crypto');

			// Hash the password using the same config as the app
			const hashedPassword = await argon2.hash('Admin123!', {
				memoryCost: 65536, // 64 MB
				timeCost: 3,
				parallelism: 4,
				type: argon2.argon2id
			});

			await db.collection('auth_users').insertOne({
				_id: crypto.randomUUID().replace(/-/g, ''),
				email: 'admin@example.com',
				username: 'admin',
				password: hashedPassword,
				role: 'admin',
				blocked: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}
	} catch (e: any) {
		console.warn('Warning: Failed to seed admin user:', e.message);
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
 * Seeds the default theme into the database.
 * This matches the DEFAULT_THEME in themeManager.ts
 */
async function seedDefaultTheme(db: any): Promise<void> {
	try {
		// Note: collection name is 'system_theme' (singular) to match MongoDB model
		const existingTheme = await db.collection('system_theme').findOne({ _id: '670e8b8c4d123456789abcde' });
		if (!existingTheme) {
			console.log('[testSetup] Seeding default theme...');
			const now = new Date();
			await db.collection('system_theme').insertOne({
				_id: '670e8b8c4d123456789abcde',
				path: '',
				name: 'SveltyCMSTheme',
				isActive: true,
				isDefault: true,
				config: {
					tailwindConfigPath: '',
					assetsPath: ''
				},
				createdAt: now,
				updatedAt: now
			});
		}
	} catch (e: any) {
		console.warn('Warning: Failed to seed theme:', e.message);
	}
}

/**
 * Extracts just the cookie name=value from a set-cookie header.
 * The set-cookie header includes attributes like Path, HttpOnly, etc.
 * but the Cookie request header should only contain name=value pairs.
 *
 * Example:
 *   Input:  "sveltycms_session=abc123; Path=/; HttpOnly; SameSite=strict"
 *   Output: "sveltycms_session=abc123"
 */
function extractCookieValue(setCookieHeader: string): string {
	return setCookieHeader.split(';')[0].trim();
}

/**
 * Prepare an authenticated context (login as admin).
 * Uses the Setup API to properly initialize the system if needed.
 * @returns {Promise<string>} Authentication cookie.
 */
export async function prepareAuthenticatedContext(): Promise<string> {
	const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4173';

	// Check if system is already set up
	const statusResp = await fetch(`${API_BASE_URL}/api/setup/status`);
	const status = await statusResp.json();

	if (!status.setupComplete) {
		// System needs setup - use the Setup API
		const dbConfig = {
			type: 'mongodb',
			host: process.env.DB_HOST || 'localhost',
			port: parseInt(process.env.DB_PORT || '27017'),
			name: process.env.DB_NAME || 'sveltycms_test',
			user: process.env.DB_USER || '',
			password: process.env.DB_PASSWORD || ''
		};

		// Step 1: Seed database config
		await fetch(`${API_BASE_URL}/api/setup/seed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(dbConfig)
		});

		// Step 2: Complete setup with admin user
		const completeResp = await fetch(`${API_BASE_URL}/api/setup/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				admin: testFixtures.users.admin,
				skipWelcomeEmail: true
			})
		});

		if (completeResp.ok) {
			// Setup complete - seed additional data and extract cookie
			await seedBasicRoles(); // Ensure theme and other data is seeded
			const rawCookie = completeResp.headers.get('set-cookie');
			if (rawCookie) {
				// Extract just the cookie value, not the attributes like Path, HttpOnly, etc.
				return extractCookieValue(rawCookie);
			}
		}
	}

	// System is already set up or setup completed - just login
	// First ensure admin user exists via direct seeding (for cases where setup was done but user was cleaned)
	await seedBasicRoles();

	// Try to login
	try {
		const cookie = await loginAsAdmin();
		if (cookie) {
			return cookie;
		}
	} catch (e) {
		// Login failed - user might not exist, try creating via API
	}

	// Fallback: create user and login
	await createTestUsers();
	const cookie = await loginAsAdmin();

	if (!cookie) {
		throw new Error('FAILED to get admin authentication cookie!');
	}

	return cookie;
}

// Common test data (fixtures).
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
