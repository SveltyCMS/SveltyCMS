/**
 * @file tests/bun/helpers/testSetup.ts
 * @description Static test data and environment initialization with SAFETY GUARDS.
 */
import { waitForServer } from './server';
import { createTestUsers, loginAsAdmin } from './auth';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';

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

// Cleanup the test database (DB-agnostic).
export async function cleanupTestDatabase(): Promise<void> {
	console.log('[cleanupTestDatabase] Starting...');

	if (process.env.SKIP_DB_CLEANUP === 'true') {
		console.log('[cleanupTestDatabase] Skipping DB cleanup (SKIP_DB_CLEANUP=true).');
		return;
	}

	const dbType = process.env.DB_TYPE || 'mongodb';
	const dbName = process.env.DB_NAME || 'sveltycms_test';

	console.log(`[cleanupTestDatabase] Cleaning up ${dbName} (${dbType})...`);

	try {
		const { initializeForSetup, dbAdapter } = await import('@src/databases/db');
		const setupRes = await initializeForSetup({
			type: dbType,
			host: process.env.DB_HOST || '127.0.0.1',
			port: parseInt(process.env.DB_PORT || '27017'),
			name: dbName,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD
		});

		if (!setupRes.success) {
			console.warn('[cleanupTestDatabase] Failed to initialize DB for cleanup:', setupRes.error);
			return;
		}

		if (dbAdapter) {
			if (dbType === 'mongodb') {
				const mongoConn = (dbAdapter as any).client?.db(dbName);
				if (mongoConn) {
					await mongoConn.dropDatabase();
					console.log('[cleanupTestDatabase] MongoDB Database Dropped.');
				}
			} else {
				console.log(`[cleanupTestDatabase] DB Agnostic cleanup for ${dbType} - Disconnecting.`);
				// For SQL databases, table-level cleanup is usually handled by Drizzle push --force or similar in CI
				// Or we could implement a generic truncate all tables if needed.
			}
			await dbAdapter.disconnect();
		}
	} catch (e: any) {
		console.warn('[cleanupTestDatabase] Warning: Failed to cleanup test database:', e.message);
	}
}

/**
 * Seeds basic roles into the database (DB-agnostic).
 */
async function seedBasicRoles(): Promise<void> {
	const dbType = process.env.DB_TYPE || 'mongodb';
	const dbName = process.env.DB_NAME || 'sveltycms_test';

	try {
		const { initializeForSetup, dbAdapter } = await import('@src/databases/db');
		const setupRes = await initializeForSetup({
			type: dbType,
			host: process.env.DB_HOST || '127.0.0.1',
			port: parseInt(process.env.DB_PORT || '27017'),
			name: dbName,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD
		});

		if (!setupRes.success || !dbAdapter) {
			console.warn('[testSetup] Failed to initialize DB for seeding roles:', setupRes.error);
			return;
		}

		// Check if admin role exists
		const adminRoleRes = await dbAdapter.crud.findOne('auth_roles', { _id: 'admin' } as any);
		if (!adminRoleRes.success || !adminRoleRes.data) {
			console.log('[testSetup] Seeding admin role...');
			const permissions = ['read', 'write', 'delete', 'admin'];
			await dbAdapter.crud.insert('auth_roles', {
				_id: 'admin' as any,
				name: 'Admin',
				description: 'System Administrator',
				permissions,
				isAdmin: true,
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);
		}

		// Seed admin user if not exists
		await seedAdminUser(dbAdapter);

		// Seed settings
		await seedBasicSettings(dbAdapter);

		// Seed default theme
		await seedDefaultTheme(dbAdapter);

		await dbAdapter.disconnect();
	} catch (e: any) {
		console.warn('[testSetup] Warning: Failed to seed data:', e.message);
	}
}

/**
 * Seeds the admin user (DB-agnostic).
 */
async function seedAdminUser(dbAdapter: any): Promise<void> {
	try {
		const existingAdmin = await dbAdapter.crud.findOne('auth_users', { email: 'admin@example.com' });
		if (!existingAdmin.success || !existingAdmin.data) {
			console.log('[testSetup] Seeding admin user...');
			const { hashPassword } = await import('../../../src/utils/password');
			const crypto = await import('crypto');

			const hashedPassword = await hashPassword('Admin123!');

			await dbAdapter.crud.insert('auth_users', {
				_id: crypto.randomUUID().replace(/-/g, ''),
				email: 'admin@example.com',
				username: 'admin',
				password: hashedPassword,
				role: 'admin',
				blocked: false,
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);
		}
	} catch (e: any) {
		console.warn('Warning: Failed to seed admin user:', e.message);
	}
}

async function seedBasicSettings(dbAdapter: any): Promise<void> {
	try {
		const existingconfig = await dbAdapter.crud.findOne('system_settings', { key: 'SITE_NAME' });
		if (!existingconfig.success || !existingconfig.data) {
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
			for (const setting of settings) {
				await dbAdapter.crud.insert('system_settings', setting as any);
			}
		}
	} catch (e: any) {
		console.warn('Warning: Failed to seed settings:', e.message);
	}
}

/**
 * Seeds the default theme (DB-agnostic).
 */
async function seedDefaultTheme(dbAdapter: any): Promise<void> {
	try {
		const existingTheme = await dbAdapter.crud.findOne('system_theme', { _id: '670e8b8c4d123456789abcde' } as any);
		if (!existingTheme.success || !existingTheme.data) {
			console.log('[testSetup] Seeding default theme...');
			const now = new Date();
			await dbAdapter.crud.insert('system_theme', {
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
			} as any);
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

	// Check if system is already set up via health endpoint
	// 503/IDLE means setup needed. 200/READY means setup complete.
	const statusResp = await fetch(`${API_BASE_URL}/api/system/health`);
	// IDLE state returns 503, so we check status or body
	const health = await statusResp.json().catch(() => ({ overallStatus: 'UNKNOWN' }));

	const setupNeeded = statusResp.status === 503 || health.overallStatus === 'IDLE';

	if (setupNeeded) {
		// System needs setup - use the Setup Actions
		const dbConfig = {
			type: 'mongodb',
			host: process.env.DB_HOST || 'localhost',
			port: parseInt(process.env.DB_PORT || '27017').toString(), // Browser-like FormData sends strings
			name: process.env.DB_NAME || 'sveltycms_test',
			user: process.env.DB_USER || '',
			password: process.env.DB_PASSWORD || ''
		};

		// 1. Test/Set Config (This action verifies and sometimes sets state in other parts of the system)
		const configForm = new FormData();
		configForm.append('config', JSON.stringify(dbConfig));
		const testRes = await fetch(`${API_BASE_URL}/setup?/testDatabase`, {
			method: 'POST',
			body: configForm,
			headers: {
				'x-sveltekit-action': 'true',
				Origin: API_BASE_URL
			}
		});
		if (!testRes.ok) {
			console.error('❌ testDatabase Action failed:', await testRes.text());
		}

		// 2. Seed Database
		const seedForm = new FormData();
		seedForm.append('config', JSON.stringify(dbConfig));
		const seedRes = await fetch(`${API_BASE_URL}/setup?/seedDatabase`, {
			method: 'POST',
			body: seedForm,
			headers: {
				'x-sveltekit-action': 'true',
				Origin: API_BASE_URL
			}
		});
		if (!seedRes.ok) {
			console.error('❌ seedDatabase Action failed:', await seedRes.text());
		}

		// 3. Complete setup with admin user and system settings
		const completeForm = new FormData();
		const payload = {
			database: dbConfig,
			admin: testFixtures.users.admin,
			system: {
				siteName: 'SveltyCMS Test',
				hostProd: API_BASE_URL,
				defaultSystemLanguage: 'en',
				systemLanguages: ['en', 'de'],
				defaultContentLanguage: 'en',
				contentLanguages: ['en', 'de'],
				mediaStorageType: 'local',
				mediaFolder: './mediaFolder',
				timezone: 'UTC'
			}
		};
		completeForm.append('data', JSON.stringify(payload));

		const completeResp = await fetch(`${API_BASE_URL}/setup?/completeSetup`, {
			method: 'POST',
			body: completeForm,
			headers: {
				'x-sveltekit-action': 'true',
				Origin: API_BASE_URL
			}
		});

		if (completeResp.ok) {
			const result = await completeResp.json();
			// Setup complete - seed additional data and extract cookie
			await seedBasicRoles(); // Ensure theme and other data is seeded
			const rawCookie = completeResp.headers.get('set-cookie');
			if (rawCookie) {
				return extractCookieValue(rawCookie);
			} else if (result.data?.sessionId) {
				return `${SESSION_COOKIE_NAME}=${result.data.sessionId}`;
			}
		} else {
			console.error('❌ completeSetup Action failed:', await completeResp.text());
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
	} catch {
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
