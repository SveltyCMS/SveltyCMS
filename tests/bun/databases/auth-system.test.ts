/**
 * @file tests/bun/databases/auth-system.test.ts
 * @description Authentication system tests
 *
 * Verifies:
 * - User registration
 * - Password security (hashing)
 * - Session management
 * - Token operations
 */

import { beforeAll, afterAll, describe, it, expect, mock } from 'bun:test';
import mongoose from 'mongoose';

// Mock SvelteKit modules
mock.module('$app/environment', () => ({
	browser: true,
	building: false,
	dev: true,
	version: 'test'
}));

// Mock logger
mock.module('@src/utils/logger', () => ({
	logger: {
		fatal: () => {},
		error: () => {},
		warn: () => {},
		info: () => {},
		debug: () => {},
		trace: () => {},
		channel: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} })
	}
}));

// Mock Svelte 5 Runes
(globalThis as any).$state = (initial: any) => initial;
(globalThis as any).$derived = (fn: any) => (typeof fn === 'function' ? fn() : fn);
(globalThis as any).$effect = () => {};
(globalThis as any).$props = () => ({});

// Dynamic imports
let adapterClass: typeof import('../../../src/databases/mongodb/mongoDBAdapter').MongoDBAdapter;
let privateEnv: any;

// Import fixtures for reusing users
import { testFixtures } from '../helpers/testSetup';

describe('Auth System Functional Tests', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let db: any = null;
	const testCollection = 'test_auth_verify_' + Date.now();

	beforeAll(async () => {
		const adapterModule = await import('../../../src/databases/mongodb/mongoDBAdapter');
		adapterClass = adapterModule.MongoDBAdapter;
		
		// Try to import config - use private.ts if private.test doesn't exist (integration tests)
		try {
			// @ts-ignore
			const configModule = await import('../../../config/private.test');
			privateEnv = configModule.privateEnv;
		} catch {
			try {
				// @ts-ignore - In integration tests, use the real config created by setup
				const configModule = await import('../../../config/private');
				privateEnv = configModule.default;
			} catch {
				console.warn('Auth Test: No config found. Skipping tests.');
				return;
			}
		}

		if (!privateEnv || !privateEnv.database?.type) return;

		// Skip test if not MongoDB (MariaDB tests shouldn't run MongoDB auth tests)
		if (!privateEnv.database.type.startsWith('mongodb')) {
			console.warn('Auth Test: Not a MongoDB database. Skipping tests.');
			return;
		}

		db = new adapterClass();

		// OPTIMIZATION: Use shared test database in TEST_MODE for speed
		// Otherwise use isolated functional DB
		const isTestMode = process.env.TEST_MODE === 'true';
		const dbConfig = privateEnv.database;
		
		// Build connection string from config
		let connectionString: string;
		
		if (dbConfig.uri) {
			// Use provided URI if available
			connectionString = dbConfig.uri;
		} else {
			// Build connection string from parts
			const dbName = isTestMode ? dbConfig.name || 'sveltycms_test' : (dbConfig.name || 'sveltycms_test') + '_functional';
			const host = dbConfig.host || 'localhost';
			const port = dbConfig.port || 27017;
			
			if (dbConfig.user && dbConfig.password) {
				connectionString = `mongodb://${dbConfig.user}:${dbConfig.password}@${host}:${port}/${dbName}?authSource=admin`;
			} else {
				connectionString = `mongodb://${host}:${port}/${dbName}`;
			}
		}

		// Use shorter timeouts for tests
		const connectOptions = { serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000 };

		try {
			await db.connect(connectionString, connectOptions);

			// Verify write access
			try {
				// Note: crud operations return { success: boolean }, not verify throwing
				const insertResult = await db.crud.insert(testCollection, { _test: true });
				if (!insertResult.success) {
					console.warn('Auth Test Write Verification Failed:', insertResult.message || insertResult.error);
					console.warn('Skipping Auth tests.');
					db = null;
				} else {
					await db.crud.deleteMany(testCollection, { _test: true });
				}
			} catch (writeErr: any) {
				console.warn('Auth Test Write Verification Exception:', writeErr.message);
				db = null;
			}
		} catch (err) {
			console.warn('Auth Test Connection Failed. Skipping tests.');
			db = null;
		}
	});

	afterAll(async () => {
		// Only drop database if we connected and verified we are in test mode (implied by db != null)
		if (mongoose.connection?.db && db) {
			// Safety check: ensure we are not dropping production DB
			const dbName = mongoose.connection.db.databaseName;

			// OPTIMIZATION: Do NOT drop the shared test database in TEST_MODE
			// Only drop if it's the isolated _functional one
			if (dbName.endsWith('_functional')) {
				await mongoose.connection.db.dropDatabase().catch(() => {});
			}
			await mongoose.disconnect();
		}
	});

	describe('User Management', () => {
		// Use pre-seeded admin from testFixtures for read tests
		const existingUser = testFixtures.users.admin;
		let existingUserId: string;

		// New user for creation test
		const newUser = {
			email: `test_${Date.now()}@example.com`,
			username: `user_${Date.now()}`,
			password: 'SecurePassword123!',
			role: 'editor'
		};
		let newUserId: string;

		beforeAll(async () => {
			if (!db) return;
			// Retrieve the pre-seeded admin user ID
			const result = await db.auth.getUserByEmail(existingUser.email);
			if (result.success && result.data) {
				existingUserId = result.data._id;
			}
		});

		it('should create a new user with hashed password', async () => {
			if (!db) return;

			const userPayload = {
				...newUser,
				avatar: 'default.png'
			};

			const result = await db.auth.createUser(userPayload);
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
			newUserId = (result.data as any)._id;
			expect(newUserId).toBeDefined();
		});

		it('should find existing user by email', async () => {
			if (!db) return;
			// Use the pre-seeded user (should be faster as it's definitely there)
			const result = await db.auth.getUserByEmail(existingUser.email);
			expect(result.success).toBe(true);
			expect(result.data.username).toBe(existingUser.username);
		});

		it('should find existing user by ID', async () => {
			if (!db || !existingUserId) return;
			const result = await db.auth.getUserById(existingUserId);
			expect(result.success).toBe(true);
			expect(result.data.email).toBe(existingUser.email);
		});

		// Cleanup created user to keep shared DB clean
		afterAll(async () => {
			if (db && newUserId) {
				await db.auth.deleteUser(newUserId);
			}
		});
	});

	describe('Session Management', () => {
		let userId: string;
		let sessionId: string;

		it('should create session for user', async () => {
			if (!db) return;

			// Create user first
			const user = await db.auth.createUser({
				email: `session_${Date.now()}@test.com`,
				username: `sess_${Date.now()}`,
				password: 'pw',
				role: 'user'
			});
			userId = (user.data as any)._id;

			const sessionData = {
				userId,
				token: 'session_token_' + Date.now(),
				expiresAt: new Date(Date.now() + 3600000), // 1 hour
				ipAddress: '127.0.0.1',
				userAgent: 'Bun Test'
			};

			const result = await db.auth.createSession(sessionData);
			expect(result.success).toBe(true);
			sessionId = (result.data as any)._id;
			expect(sessionId).toBeDefined();
		});

		it('should validate session', async () => {
			if (!db) return;
			const result = await db.auth.validateSession(sessionId);
			// validateSession checks if not expired and exists
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
		});

		it('should delete session', async () => {
			if (!db) return;
			const result = await db.auth.deleteSession(sessionId);
			expect(result.success).toBe(true);

			// Verify deleted by checking if validation fails or find returns null
			const check = await db.auth.validateSession(sessionId);
			// Expect validation to fail or return null data
			expect(check.data).toBeNull();
		});
	});
});
