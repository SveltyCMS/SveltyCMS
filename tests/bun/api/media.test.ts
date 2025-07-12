import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment, testFixtures } from '../helpers/testSetup';

/**
 * @file tests/bun/api/media.test.ts
 * @description Integration tests for media-related API endpoints
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

describe('Media API Endpoints', () => {
	let authToken: string;

	beforeAll(async () => {
		await initializeTestEnvironment();
	});

	afterAll(async () => {
		await cleanupTestEnvironment();
	});

	beforeEach(async () => {
		await cleanupTestDatabase();

		// Create admin user and get auth token
		await fetch(`${API_BASE_URL}/api/user/createUser`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: testFixtures.users.firstAdmin.email,
				username: testFixtures.users.firstAdmin.username,
				password: testFixtures.users.firstAdmin.password,
				confirm_password: testFixtures.users.firstAdmin.password
			})
		});

		const loginResponse = await fetch(`${API_BASE_URL}/api/user/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: testFixtures.users.firstAdmin.email,
				password: testFixtures.users.firstAdmin.password
			})
		});

		const loginResult = await loginResponse.json();
		authToken = loginResult.data.token;
	});

	describe('POST /api/media/exists', () => {
		it('should check if media exists', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/exists`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					filename: 'test-image.jpg'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data.exists).toBeDefined();
		});

		it('should reject request without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/exists`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					filename: 'test-image.jpg'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject request without filename', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/exists`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/media/process', () => {
		it('should process media with valid auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/process`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					filename: 'test-image.jpg',
					operation: 'resize',
					width: 800,
					height: 600
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject processing without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/process`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					filename: 'test-image.jpg',
					operation: 'resize'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject invalid operation', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/process`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					filename: 'test-image.jpg',
					operation: 'invalid-operation'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/media/delete', () => {
		it('should delete media with admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/delete`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					filename: 'test-image.jpg'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject deletion without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/delete`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					filename: 'test-image.jpg'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject deletion without filename', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/delete`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/media/trash', () => {
		it('should move media to trash with admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/trash`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					filename: 'test-image.jpg'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject trash operation without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/trash`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					filename: 'test-image.jpg'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});
	});

	describe('GET /api/media/remote', () => {
		it('should handle remote media requests with auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/remote?url=https://example.com/image.jpg`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject remote media without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/remote?url=https://example.com/image.jpg`, {
				method: 'GET'
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject invalid URL', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/remote?url=invalid-url`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('GET /api/media/avatar', () => {
		it('should handle avatar requests', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/avatar?user=test-user`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			});

			// Avatar endpoint might return different status codes based on implementation
			expect([200, 404]).toContain(response.status);
		});

		it('should handle avatar requests without auth (public)', async () => {
			const response = await fetch(`${API_BASE_URL}/api/media/avatar?user=test-user`, {
				method: 'GET'
			});

			// Avatar endpoint might be public or require auth
			expect([200, 401, 404]).toContain(response.status);
		});
	});

	describe('POST /api/user/saveAvatar', () => {
		it('should save avatar with valid auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					avatar: 'base64-encoded-image-data'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject avatar save without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					avatar: 'base64-encoded-image-data'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject request without avatar data', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});
});
