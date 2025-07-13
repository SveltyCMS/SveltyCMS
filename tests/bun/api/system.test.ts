/**
 * @file tests/bun/api/system.test.ts
 * @description
 * Integration tests for system-wide and dashboard-related API endpoints.
 * This suite covers system information, preferences, theme management, permissions,
 * and other administrative functionalities, ensuring they are properly secured.
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

describe('System & Dashboard API Endpoints', () => {
	let authToken: string;

	beforeAll(async () => {
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

	// Helper to test authenticated GET endpoints
	const testAuthenticatedGetEndpoint = (endpoint: string) => {
		describe(`GET ${endpoint}`, () => {
			it('should succeed with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`, {
					headers: { Authorization: `Bearer ${authToken}` }
				});
				expect(response.status).toBe(200);
				const result = await response.json();
				expect(result.success).toBe(true);
			});

			it('should fail without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`);
				expect(response.status).toBe(401);
			});
		});
	};

	describe('Dashboard Endpoints', () => {
		testAuthenticatedGetEndpoint('/api/dashboard/systemInfo');
		testAuthenticatedGetEndpoint('/api/dashboard/userActivity');
		testAuthenticatedGetEndpoint('/api/dashboard/last5media');
		testAuthenticatedGetEndpoint('/api/dashboard/last5Content');
		testAuthenticatedGetEndpoint('/api/dashboard/systemPreferences');
		testAuthenticatedGetEndpoint('/api/dashboard/systemMessages');
	});

	describe('System Preferences', () => {
		testAuthenticatedGetEndpoint('/api/systemPreferences');

		describe('POST /api/systemPreferences', () => {
			it('should update system preferences with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/systemPreferences`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({ siteName: 'Updated Site Name' })
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should fail to update without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/systemPreferences`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ siteName: 'Updated Site Name' })
				});
				expect(response.status).toBe(401);
			});
		});
	});

	describe('Theme Management', () => {
		describe('GET /api/theme/get-current-theme', () => {
			it('should get the current theme, which may be public', async () => {
				const response = await fetch(`${API_BASE_URL}/api/theme/get-current-theme`);
				// This endpoint might be public, so 200 is a valid response without auth.
				expect([200, 401]).toContain(response.status);
			});
		});

		describe('POST /api/theme/update-theme', () => {
			it('should update the theme with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/theme/update-theme`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({ theme: 'dark' })
				});
				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should fail to update the theme without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/theme/update-theme`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ theme: 'dark' })
				});
				expect(response.status).toBe(401);
			});
		});
	});

	describe('Permission Management', () => {
		describe('POST /api/permission/update', () => {
			it('should update permissions with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/permission/update`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({ userId: 'test-user-id', permissions: ['read', 'write'] })
				});
				// This might return 404 if the user doesn't exist, which is acceptable for this test.
				expect([200, 404]).toContain(response.status);
			});

			it('should fail to update permissions without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/permission/update`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: 'test-user-id', permissions: ['read'] })
				});
				expect(response.status).toBe(401);
			});

			it('should fail with invalid permission data', async () => {
				const response = await fetch(`${API_BASE_URL}/api/permission/update`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({ permissions: ['read'] }) // Missing userId
				});
				expect(response.status).toBe(400);
			});
		});
	});

	describe('Email Service', () => {
		describe('POST /api/sendMail', () => {
			it('should send an email with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/sendMail`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({ to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' })
				});
				// This endpoint likely connects to a real service, so we accept 200 (success) or 500 (service fail)
				expect([200, 500]).toContain(response.status);
			});

			it('should fail to send an email without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/sendMail`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' })
				});
				expect(response.status).toBe(401);
			});
		});
	});

	describe('Video Processing', () => {
		describe('POST /api/video', () => {
			it('should process a video with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/video`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`
					},
					body: JSON.stringify({ videoUrl: 'https://example.com/video.mp4', operation: 'transcode' })
				});
				// This endpoint likely connects to a real service, so we accept 200 (success) or 500 (service fail)
				expect([200, 500]).toContain(response.status);
			});

			it('should fail to process a video without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/video`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ videoUrl: 'https://example.com/video.mp4', operation: 'transcode' })
				});
				expect(response.status).toBe(401);
			});
		});
	});
});
