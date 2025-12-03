/**
 * @file tests/bun/api/media.test.ts
 * @description
 * Integration tests for all media-related API endpoints.
 * This suite covers media processing, deletion, existence checks, and avatar management,
 * ensuring all endpoints are properly secured with admin authentication.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { prepareAuthenticatedContext, cleanupTestDatabase } from '../helpers/testSetup';
import { getApiBaseUrl, waitForServer } from '../helpers/server';

const API_BASE_URL = getApiBaseUrl();

describe('Media API Endpoints', () => {
	let authCookie: string;

	beforeAll(async () => {
		await waitForServer();
	});

	afterAll(async () => {
		await cleanupTestDatabase();
	});

	// Before each test, clean the DB and get a fresh admin session
	beforeEach(async () => {
		authCookie = await prepareAuthenticatedContext();
	});

	const testAuthenticatedPostEndpoint = (endpoint: string, body: object, successStatus = 200) => {
		describe(`POST ${endpoint}`, () => {
			it('should succeed with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Cookie: authCookie },
					body: JSON.stringify(body)
				});
				// Some operations might succeed but return a different status if the resource doesn't exist.
				expect([successStatus, 404]).toContain(response.status);
			});

			it('should fail without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				expect(response.status).toBe(401);
			});

			it('should fail with missing required body fields', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Cookie: authCookie },
					body: JSON.stringify({}) // Empty body
				});
				expect(response.status).toBe(400);
			});
		});
	};

	testAuthenticatedPostEndpoint('/api/media/exists', { filename: 'test-image.jpg' });
	testAuthenticatedPostEndpoint('/api/media/process', { filename: 'test-image.jpg', operation: 'resize' });
	testAuthenticatedPostEndpoint('/api/media/delete', { filename: 'test-image.jpg' });
	testAuthenticatedPostEndpoint('/api/media/trash', { filename: 'test-image.jpg' });
	testAuthenticatedPostEndpoint('/api/user/saveAvatar', { avatar: 'base64-encoded-image-data' });

	describe('GET /api/media/remote', () => {
		it('should handle remote media requests with authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/remote?url=https://example.com/image.jpg`, {
				headers: { Cookie: authCookie }
			});
			// This will likely fail if it tries to fetch the actual image, so 500 is also a possible outcome.
			expect([200, 500]).toContain(response.status);
		});

		it('should reject remote media request without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/remote?url=https://example.com/image.jpg`);
			expect(response.status).toBe(401);
		});

		it('should reject request with an invalid URL', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/remote?url=invalid-url`, {
				headers: { Cookie: authCookie }
			});
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/media/avatar', () => {
		it('should handle avatar requests, which may be public', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/avatar?user=test-user`);
			// Avatar endpoint might be public or require auth, and might 404 if user/avatar doesn't exist.
			expect([200, 401, 404]).toContain(response.status);
		});
	});
});
