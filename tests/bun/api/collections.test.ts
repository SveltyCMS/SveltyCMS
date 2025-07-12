import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment, testFixtures } from '../helpers/testSetup';

/**
 * @file tests/bun/api/collections.test.ts
 * @description Integration tests for collection and content-related API endpoints
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

describe('Collections & Content API Endpoints', () => {
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

	describe('GET /api/getCollection/[collectionId]', () => {
		it('should get collection with valid auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getCollection/Posts`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject request without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getCollection/Posts`, {
				method: 'GET'
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should handle non-existent collection', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getCollection/NonExistentCollection`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(404);
			expect(result.success).toBe(false);
		});
	});

	describe('GET /api/content-structure', () => {
		it('should get content structure with admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/content-structure`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject request without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/content-structure`, {
				method: 'GET'
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/find', () => {
		it('should find content with valid search', async () => {
			const response = await fetch(`${API_BASE_URL}/api/find`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					collection: 'Posts',
					query: {},
					limit: 10
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject find without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/find`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					collection: 'Posts',
					query: {}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should handle invalid collection in find', async () => {
			const response = await fetch(`${API_BASE_URL}/api/find`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					collection: 'InvalidCollection',
					query: {}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should handle complex search queries', async () => {
			const response = await fetch(`${API_BASE_URL}/api/find`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					collection: 'Posts',
					query: {
						title: { $regex: 'test', $options: 'i' }
					},
					limit: 5,
					sort: { createdAt: -1 }
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});
	});

	describe('POST /api/query', () => {
		it('should execute query with valid auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/query`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					operation: 'find',
					collection: 'Posts',
					data: {}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject query without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/query`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					operation: 'find',
					collection: 'Posts',
					data: {}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should handle insert operation', async () => {
			const response = await fetch(`${API_BASE_URL}/api/query`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					operation: 'insert',
					collection: 'Posts',
					data: {
						title: 'Test Post',
						content: 'Test content',
						author: 'Test Author'
					}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should handle update operation', async () => {
			const response = await fetch(`${API_BASE_URL}/api/query`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					operation: 'update',
					collection: 'Posts',
					query: { title: 'Test Post' },
					data: { content: 'Updated content' }
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should handle delete operation', async () => {
			const response = await fetch(`${API_BASE_URL}/api/query`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					operation: 'delete',
					collection: 'Posts',
					query: { title: 'Test Post' }
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject invalid operation', async () => {
			const response = await fetch(`${API_BASE_URL}/api/query`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					operation: 'invalid-operation',
					collection: 'Posts',
					data: {}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/compile', () => {
		it('should compile collections with admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/compile`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					collections: ['Posts', 'Pages']
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject compile without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/compile`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					collections: ['Posts']
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should handle compile without collections specified', async () => {
			const response = await fetch(`${API_BASE_URL}/api/compile`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});
	});

	describe('GET /api/exportData', () => {
		it('should export data with admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/exportData`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject export without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/exportData`, {
				method: 'GET'
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});
	});
});
