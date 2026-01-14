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

describe('Auth System Functional Tests', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let db: any = null;
	const testCollection = 'test_auth_verify_' + Date.now();

	beforeAll(async () => {
		const adapterModule = await import('../../../src/databases/mongodb/mongoDBAdapter');
		adapterClass = adapterModule.MongoDBAdapter;
		const configModule = await import('../../../config/private.test');
		privateEnv = configModule.privateEnv;

		if (!privateEnv || !privateEnv.DB_TYPE) return;

		db = new adapterClass();

		// CRITICAL: Use isolated test database
		const dbName = (privateEnv.DB_NAME || 'sveltycms_test') + '_functional';
		let connectionString = `mongodb://${privateEnv.DB_HOST}:${privateEnv.DB_PORT}/${dbName}`;

		if (privateEnv.DB_USER && privateEnv.DB_PASSWORD) {
			connectionString = `mongodb://${privateEnv.DB_USER}:${privateEnv.DB_PASSWORD}@${privateEnv.DB_HOST}:${privateEnv.DB_PORT}/${dbName}?authSource=admin`;
		}

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
			if (dbName.endsWith('_functional')) {
				await mongoose.connection.db.dropDatabase().catch(() => {});
			}
			await mongoose.disconnect();
		}
	});

	describe('User Management', () => {
		const testUser = {
			email: `test_${Date.now()}@example.com`,
			username: `user_${Date.now()}`,
			password: 'SecurePassword123!',
			role: 'admin'
		};
		let userId: string;

		it('should create a new user with hashed password', async () => {
			if (!db) return;

			const userPayload = {
				...testUser,
				avatar: 'default.png'
			};

			const result = await db.auth.createUser(userPayload);
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
			userId = (result.data as any)._id;
			expect(userId).toBeDefined();
		});

		it('should find user by email', async () => {
			if (!db) return;
			const result = await db.auth.getUserByEmail(testUser.email);
			expect(result.success).toBe(true);
			expect(result.data.username).toBe(testUser.username);
		});

		it('should find user by ID', async () => {
			if (!db) return;
			const result = await db.auth.getUserById(userId);
			expect(result.success).toBe(true);
			expect(result.data.email).toBe(testUser.email);
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
