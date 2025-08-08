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

	testAuthenticatedGetEndpoint('/api/collections', 200); // Modern collections list endpoint
	testAuthenticatedGetEndpoint('/api/content-structure');
	testAuthenticatedGetEndpoint('/api/exportData');

	describe('POST /api/search', () => {
		it('should find content with a valid search query', async () => {
			const response = await fetch(`${API_BASE_URL}/api/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({ query: 'test', collections: [] })
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: 'test', collections: [] })
			});
			expect(response.status).toBe(401);
		});

		it('should handle empty search query', async () => {
			const response = await fetch(`${API_BASE_URL}/api/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({ query: '', collections: [] })
			});
			expect(response.status).toBe(200);
		});
	});

	describe('RESTful Collection Operations', () => {
		const testCollectionId = '23d772dd3783492a9115ee9ea6bc6185'; // Using a valid collection ID

		const testCollectionOperation = async (collectionId: string, body: object, method = 'POST') => {
			return fetch(`${API_BASE_URL}/api/collections/${collectionId}`, {
				method,
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify(body)
			});
		};

		it('should handle creating a new entry', async () => {
			const response = await testCollectionOperation(testCollectionId, {
				title: 'Test Post',
				content: 'Test content'
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should get collection entries', async () => {
			const response = await fetch(`${API_BASE_URL}/api/collections/${testCollectionId}?page=1&pageSize=10`, {
				headers: { Authorization: `Bearer ${authToken}` }
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/collections/${testCollectionId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Test Post' })
			});
			expect(response.status).toBe(401);
		});

		it('should fail with invalid collection ID', async () => {
			const response = await testCollectionOperation('invalid-collection-id', {
				title: 'Test Post'
			});
			expect(response.status).toBe(404);
		});
	});

	describe('POST /api/content-structure (recompile)', () => {
		it('should recompile all collections with admin authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/content-structure`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
				body: JSON.stringify({ action: 'recompile' })
			});
			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.message).toBe('Collections recompiled successfully');
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/content-structure`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'recompile' })
			});
			expect(response.status).toBe(401);
		});
	});
});
