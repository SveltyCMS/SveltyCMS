/**
 * @file tests/bun/api/config.test.ts
 * @description
 * Integration tests for configuration management API endpoints.
 * This suite covers loading, saving, backing up, and testing configurations,
 * ensuring all administrative actions are properly secured.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment, testFixtures } from '../helpers/testSetup';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

/**
 * Helper function to create an admin user, log in, and return the auth token.
 * @returns {Promise<string>} The authorization bearer token.
 */
const loginAsAdminAndGetToken = async (): Promise<string> => {
	// Create the admin user
	await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(testFixtures.users.firstAdmin)
	});

	// Log in as the admin user
	const loginResponse = await fetch(`${API_BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: testFixtures.users.firstAdmin.email,
			password: testFixtures.users.firstAdmin.password
		})
	});

	if (loginResponse.status !== 200) {
		throw new Error('Test setup failed: Could not log in as admin.');
	}

	const loginResult = await loginResponse.json();
	const token = loginResult.data?.token;

	if (!token) {
		throw new Error('Test setup failed: Auth token was not found in login response.');
	}

	return token;
};

describe('Configuration API Endpoints', () => {
	let authToken: string;

	beforeAll(async () => {
		// This should also create dummy config files if they don't exist
		await initializeTestEnvironment();
	});

	afterAll(async () => {
		await cleanupTestEnvironment();
	});

	// Before each test, clean the DB and get a fresh admin token.
	beforeEach(async () => {
		await cleanupTestDatabase();
		authToken = await loginAsAdminAndGetToken();
	});

	describe('GET /api/config/load', () => {
		it('should load configuration with admin authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/config/load`, {
				headers: { Authorization: `Bearer ${authToken}` }
			});
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data.publicEnv).toBeDefined();
			expect(result.data.privateEnv).toBeDefined();
			expect(result.data.publicConfigCategories).toBeDefined();
		});

		it('should fail to load configuration without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/config/load`);
			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/save-config', () => {
		it('should save public configuration with admin authentication', async () => {
			const newSiteName = `Test Site ${Date.now()}`;
			const response = await fetch(`${API_BASE_URL}/api/save-config`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({
					isPrivate: false,
					configData: { siteName: newSiteName }
				})
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);

			// Verify the change was saved by loading the config again
			const loadResponse = await fetch(`${API_BASE_URL}/api/config/load`, {
				headers: { Authorization: `Bearer ${authToken}` }
			});
			const loadResult = await loadResponse.json();
			expect(loadResult.data.publicEnv.siteName).toBe(newSiteName);
		});

		it('should fail to save configuration without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/save-config`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isPrivate: false, configData: { siteName: 'Attempt' } })
			});
			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/config/backup', () => {
		it('should create a configuration backup with admin authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/config/backup`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${authToken}` }
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should fail to create a backup without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/config/backup`, {
				method: 'POST'
			});
			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/config/test-db', () => {
		it('should handle a failed connection test gracefully', async () => {
			const response = await fetch(`${API_BASE_URL}/api/config/test-db`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({
					DB_TYPE: 'mongodb',
					DB_HOST: 'localhost',
					DB_PORT: 9999, // Use a port that is unlikely to be open
					DB_USER: 'baduser',
					DB_PASSWORD: 'badpassword',
					DB_NAME: 'test'
				})
			});
			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
			expect(result.message).toContain('connection failed');
		});

		it('should fail to test connection without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/config/test-db`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ DB_TYPE: 'mongodb' })
			});
			expect(response.status).toBe(401);
		});

		it('should fail with an invalid database type', async () => {
			const response = await fetch(`${API_BASE_URL}/api/config/test-db`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({ DB_TYPE: 'invalid_db' })
			});
			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.message).toContain('Invalid database type');
		});
	});
});
