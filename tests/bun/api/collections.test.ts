/**
 * @file tests/bun/api/collections.test.ts
 * @description
 * Integration tests for collection, content, and data query API endpoints.
 * This suite covers fetching collections, finding content via different methods,
 * performing CRUD operations through the generic query endpoint, and data management tasks.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import {
	cleanupTestDatabase,
	cleanupTestEnvironment,
	initializeTestEnvironment,
	loginAsAdminAndGetToken as createFirstAdminAndGetToken
} from '../helpers/testSetup';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

/**
 * Helper function to create an admin user, log in, and return the auth token.
 * @returns {Promise<string>} The authorization bearer token.
 */
const loginAsAdminAndGetToken = async (): Promise<string> => {
	return await createFirstAdminAndGetToken();
};

describe('Collections & Content API Endpoints', () => {
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
	const testAuthenticatedGetEndpoint = (endpoint: string, successStatus = 200) => {
		describe(`GET ${endpoint}`, () => {
			it('should succeed with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`, {
					headers: { Authorization: `Bearer ${authToken}` }
				});
				expect(response.status).toBe(successStatus);
				if (successStatus === 200) {
					const result = await response.json();
					expect(result.success).toBe(true);
				}
			});

			it('should fail without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`);
				expect(response.status).toBe(401);
			});
		});
	};

	testAuthenticatedGetEndpoint('/api/getCollection/Posts', 200); // Assuming 'Posts' collection exists in test setup
	testAuthenticatedGetEndpoint('/api/content-structure');
	testAuthenticatedGetEndpoint('/api/exportData');

	describe('POST /api/find', () => {
		it('should find content with a valid search query', async () => {
			const response = await fetch(`${API_BASE_URL}/api/find`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({ collection: 'Posts', query: {} })
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/find`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ collection: 'Posts', query: {} })
			});
			expect(response.status).toBe(401);
		});

		it('should fail with an invalid collection name', async () => {
			const response = await fetch(`${API_BASE_URL}/api/find`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({ collection: 'InvalidCollection', query: {} })
			});
			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/query', () => {
		const testQueryOperation = async (body: object) => {
			return fetch(`${API_BASE_URL}/api/query`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify(body)
			});
		};

		it('should handle an insert operation', async () => {
			const response = await testQueryOperation({
				operation: 'insert',
				collection: 'Posts',
				data: { title: 'Test Post', content: 'Test content' }
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should handle an update operation', async () => {
			// First, insert a post to update
			await testQueryOperation({
				operation: 'insert',
				collection: 'Posts',
				data: { title: 'Original Title' }
			});

			// Now, update it
			const response = await testQueryOperation({
				operation: 'update',
				collection: 'Posts',
				query: { title: 'Original Title' },
				data: { content: 'Updated content' }
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should handle a delete operation', async () => {
			// First, insert a post to delete
			await testQueryOperation({
				operation: 'insert',
				collection: 'Posts',
				data: { title: 'To Be Deleted' }
			});

			// Now, delete it
			const response = await testQueryOperation({
				operation: 'delete',
				collection: 'Posts',
				query: { title: 'To Be Deleted' }
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/query`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ operation: 'find', collection: 'Posts' })
			});
			expect(response.status).toBe(401);
		});

		it('should fail with an invalid operation', async () => {
			const response = await testQueryOperation({
				operation: 'invalid-operation',
				collection: 'Posts'
			});
			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/compile', () => {
		it('should compile all collections with admin authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/compile`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({}) // No specific collections means compile all
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/compile`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			expect(response.status).toBe(401);
		});
	});
});
