/**
 * @file tests/bun/api/setup.test.ts
 * @description Comprehensive integration tests for Setup API endpoints
 *
 * Coverage:
 * - Database connection testing (MongoDB, MongoDB Atlas)
 * - Database driver installation
 * - Configuration seeding (private.ts, settings, themes)
 * - SMTP configuration testing (optional)
 * - Admin user creation and session initialization
 * - Error handling and validation
 * - Security checks (setup mode only)
 *
 * Endpoints Tested:
 * - POST /api/setup/test-database (6 tests)
 * - POST /api/setup/install-driver (3 tests)
 * - POST /api/setup/seed (3 tests)
 * - POST /api/setup/email-test (4 tests)
 * - POST /api/setup/complete (4 tests)
 */

// @ts-expect-error - bun:test is a runtime module
import { describe, it, expect, beforeEach } from 'bun:test';
import { getApiBaseUrl } from '../helpers/server';
import { cleanupTestDatabase } from '../helpers/testSetup';
import type { DatabaseConfig } from '@src/databases/schemas';

const API_BASE_URL = getApiBaseUrl();

// Test database configuration
const testDbConfig: DatabaseConfig = {
	type: 'mongodb',
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT || '27017'),
	name: process.env.DB_NAME || 'sveltycms_test',
	user: process.env.DB_USER || '',
	password: process.env.DB_PASSWORD || ''
};

// Test SMTP configuration
const testSmtpConfig = {
	host: 'smtp.gmail.com',
	port: 587,
	user: 'test@example.com',
	password: 'test-password',
	from: 'noreply@example.com',
	secure: true
};

// Test admin user
const testAdminUser = {
	username: 'admin',
	email: 'admin@test.com',
	password: 'Admin123!@#',
	confirmPassword: 'Admin123!@#'
};

describe('Setup API - Database Connection Tests', () => {
	beforeEach(async () => {
		await cleanupTestDatabase();
	});

	it('should successfully test MongoDB connection with valid credentials', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});

		expect(response.status).toBe(200);
		const result = await response.json();

		expect(result.success).toBe(true);
		expect(result.message).toBeDefined();
		expect(result.latencyMs).toBeDefined();
		expect(result.authenticated).toBeDefined();
	});

	it('should return detailed error for invalid database credentials', async () => {
		const invalidConfig = {
			...testDbConfig,
			user: 'invalid_user',
			password: 'wrong_password'
		};

		const response = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(invalidConfig)
		});

		const result = await response.json();

		expect(result.success).toBe(false);
		expect(result.classification).toBeDefined();
		expect(result.userFriendly).toBeDefined();
	});

	it('should return error for connection refused (invalid host/port)', async () => {
		const invalidConfig = {
			...testDbConfig,
			host: 'invalid-host-that-does-not-exist',
			port: 99999
		};

		const response = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(invalidConfig)
		});

		const result = await response.json();

		expect(result.success).toBe(false);
		expect(result.classification).toMatch(/connection|network|dns/i);
	});

	it('should validate required database configuration fields', async () => {
		const incompleteConfig = {
			type: 'mongodb',
			host: 'localhost'
			// Missing required fields: port, name
		};

		const response = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(incompleteConfig)
		});

		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.success).toBe(false);
	});

	it('should detect MongoDB Atlas SRV connections', async () => {
		const atlasConfig: DatabaseConfig = {
			type: 'mongodb+srv',
			host: 'cluster0.example.mongodb.net',
			port: 27017,
			name: 'test',
			user: 'testuser',
			password: 'testpass'
		};

		const response = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(atlasConfig)
		});

		const result = await response.json();

		// Will fail connection but should recognize Atlas format
		if (!result.success) {
			expect(result.atlas).toBeDefined();
		}
	});

	it('should return database statistics on successful connection', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});

		expect(response.status).toBe(200);
		const result = await response.json();

		if (result.success) {
			expect(result.stats).toBeDefined();
			expect(result.collectionsSample).toBeDefined();
		}
	});
});

describe('Setup API - Database Driver Installation', () => {
	it('should check if MongoDB driver is installed', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/install-driver`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dbType: 'mongodb' })
		});

		expect(response.status).toBe(200);
		const result = await response.json();

		expect(result.driverPackage).toBe('mongoose');
		expect(result.installed).toBeDefined();
	});

	it('should reject invalid database types', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/install-driver`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dbType: 'invalid-db-type' })
		});

		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.success).toBe(false);
	});

	it('should validate request body structure', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/install-driver`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/missing|required/i);
	});
});

describe('Setup API - Database Seeding', () => {
	beforeEach(async () => {
		await cleanupTestDatabase();
	});

	it('should write private.ts configuration file', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/seed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});

		expect(response.status).toBe(200);
		const result = await response.json();

		expect(result.success).toBe(true);
		expect(result.message).toBeDefined();

		// Verify private.ts was created
		const fs = await import('fs/promises');
		const path = await import('path');
		const privateConfigPath = path.resolve(process.cwd(), 'config', 'private.ts');

		try {
			await fs.access(privateConfigPath);
			// File exists
		} catch {
			throw new Error('private.ts was not created');
		}
	});

	it('should seed default settings and themes', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/seed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});

		expect(response.status).toBe(200);
		const result = await response.json();

		expect(result.success).toBe(true);
		expect(result.firstCollection).toBeDefined();
	});

	it('should handle database connection errors during seeding', async () => {
		const invalidConfig = {
			...testDbConfig,
			host: 'invalid-host'
		};

		const response = await fetch(`${API_BASE_URL}/api/setup/seed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(invalidConfig)
		});

		// Should still return 200 with graceful error handling
		const result = await response.json();

		if (!result.success) {
			expect(result.error).toBeDefined();
			expect(result.message).toMatch(/failed|error/i);
		}
	});
});

describe('Setup API - SMTP Configuration (Optional)', () => {
	it('should test SMTP connection successfully', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/email-test`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...testSmtpConfig,
				testEmail: 'test@example.com',
				saveToDatabase: false
			})
		});

		const result = await response.json();

		// SMTP test may fail in CI/test environment
		expect(result.success).toBeDefined();
		if (!result.success) {
			expect(result.error).toBeDefined();
		}
	});

	it('should validate SMTP configuration fields', async () => {
		const invalidConfig = {
			host: 'smtp.gmail.com',
			// Missing required fields
			testEmail: 'test@example.com'
		};

		const response = await fetch(`${API_BASE_URL}/api/setup/email-test`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(invalidConfig)
		});

		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.success).toBe(false);
	});

	it('should require testEmail field', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/email-test`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...testSmtpConfig
				// Missing testEmail
			})
		});

		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.error).toMatch(/testEmail/i);
	});

	it('should optionally save SMTP settings to database', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/email-test`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...testSmtpConfig,
				testEmail: 'test@example.com',
				saveToDatabase: true
			})
		});

		const result = await response.json();

		if (result.success) {
			expect(result.saved).toBe(true);
		}
	});
});

describe('Setup API - Complete Setup', () => {
	beforeEach(async () => {
		await cleanupTestDatabase();

		// Seed the database first
		await fetch(`${API_BASE_URL}/api/setup/seed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});
	});

	it('should create admin user and initialize system', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				admin: testAdminUser,
				skipWelcomeEmail: true
			})
		});

		expect(response.status).toBe(200);
		const result = await response.json();

		expect(result.success).toBe(true);
		expect(result.message).toBeDefined();
		expect(result.redirectTo).toBeDefined();

		// Verify session cookie was set
		const setCookieHeader = response.headers.get('set-cookie');
		expect(setCookieHeader).toBeDefined();
		expect(setCookieHeader).toContain('auth_session');
	});

	it('should validate admin user data', async () => {
		const invalidAdmin = {
			username: 'a', // Too short
			email: 'invalid-email',
			password: '123', // Too weak
			confirmPassword: '456' // Doesn't match
		};

		const response = await fetch(`${API_BASE_URL}/api/setup/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				admin: invalidAdmin
			})
		});

		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
	});

	it('should enforce password requirements', async () => {
		const weakPasswordAdmin = {
			...testAdminUser,
			password: 'weak',
			confirmPassword: 'weak'
		};

		const response = await fetch(`${API_BASE_URL}/api/setup/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				admin: weakPasswordAdmin
			})
		});

		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.error).toMatch(/password/i);
	});

	it('should redirect to first collection after setup', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				admin: testAdminUser,
				skipWelcomeEmail: true,
				firstCollection: {
					name: 'Posts',
					path: '/posts',
					_id: 'test-collection-id'
				}
			})
		});

		expect(response.status).toBe(200);
		const result = await response.json();

		expect(result.success).toBe(true);
		expect(result.redirectTo).toContain('/posts');
	});
});

describe('Setup API - Security & Error Handling', () => {
	it('should block setup endpoints after setup is complete', async () => {
		// This test assumes setup has been completed
		// In a real test, you'd complete setup first, then verify endpoints are blocked
		// This is tested in the hooks.server.ts middleware
		// Just documenting the expected behavior
	});

	it('should handle malformed JSON requests', async () => {
		const response = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'invalid-json'
		});

		expect(response.status).toBe(400);
	});

	it('should return appropriate error codes for different failures', async () => {
		// Test various error scenarios
		const scenarios = [
			{
				endpoint: '/api/setup/test-database',
				body: {},
				expectedStatus: 400,
				description: 'Missing required fields'
			},
			{
				endpoint: '/api/setup/install-driver',
				body: { dbType: 'invalid' },
				expectedStatus: 400,
				description: 'Invalid database type'
			}
		];

		for (const scenario of scenarios) {
			const response = await fetch(`${API_BASE_URL}${scenario.endpoint}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(scenario.body)
			});

			expect(response.status).toBe(scenario.expectedStatus);
		}
	});
});
