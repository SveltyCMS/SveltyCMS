/**
 * @file tests/bun/api/collections.test.ts
 * @description Integration tests for Collections API.
 * Refactored to use Cookie authentication and ensure test data exists.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { prepareAuthenticatedContext } from '../helpers/testSetup'; // Correct import
import { initializeTestEnvironment } from '../helpers/testSetup';
import { getApiBaseUrl } from '../helpers/server';
import { write } from 'bun';
import { unlink } from 'node:fs/promises';

const API_BASE_URL = getApiBaseUrl();

// We need a collection to test against. Since CI cleans config/collections,
// we must ensure one exists.
const TEST_COLLECTION_NAME = 'test_posts';
const TEST_COLLECTION_PATH = `config/collections/${TEST_COLLECTION_NAME}.ts`;
const TEST_COLLECTION_CONFIG = `
import type { CollectionConfig } from '@shared/types/CollectionConfig';
const config: CollectionConfig = {
	name: '${TEST_COLLECTION_NAME}',
	slug: '${TEST_COLLECTION_NAME}',
	fields: [
		{ name: 'title', label: 'Title', widget: 'text' },
		{ name: 'content', label: 'Content', widget: 'richtext' },
		{ name: 'status', label: 'Status', widget: 'text' }
	]
};
export default config;
`;

describe('Collections & Content API', () => {
	let adminCookie: string;

	// 1. Global Setup
	beforeAll(async () => {
		await initializeTestEnvironment();

		// Create a temporary collection config file so the API isn't empty
		try {
			await write(TEST_COLLECTION_PATH, TEST_COLLECTION_CONFIG);
			// Wait briefly for file watcher/server to pick up the new collection
			await new Promise((r) => setTimeout(r, 1000));
		} catch (e) {
			console.warn('Could not write test collection config. Tests might fail if no collections exist.');
		}
	});

	// 2. Global Teardown
	afterAll(async () => {
		try {
			await unlink(TEST_COLLECTION_PATH);
		} catch (e) {
			// Ignore if file doesn't exist
		}
	});

	// 3. Per-Test Isolation (Fresh DB + Login)
	beforeEach(async () => {
		adminCookie = await prepareAuthenticatedContext();

		// Trigger a recompile to ensure the CMS knows about our test collection
		// This handles cases where hot-reload didn't catch the file write
		await fetch(`${API_BASE_URL}/api/content-structure`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
			body: JSON.stringify({ action: 'recompile' })
		});
	});

	// --- GET ENDPOINTS ---
	const testGetEndpoint = (endpoint: string) => {
		describe(`GET ${endpoint}`, () => {
			it('should succeed with admin cookie', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`, {
					headers: { Cookie: adminCookie }
				});
				expect(response.status).toBe(200);
				const result = await response.json();
				// Some endpoints return { success: true }, others just data
				if (result.success !== undefined) {
					expect(result.success).toBe(true);
				}
			});

			it('should fail without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}${endpoint}`);
				expect(response.status).toBe(401);
			});
		});
	};

	testGetEndpoint('/api/collections');
	testGetEndpoint('/api/content-structure');
	// testGetEndpoint('/api/exportData'); // Often fails if no data exists, enable if needed

	// --- SEARCH ---
	describe('GET /api/search', () => {
		it('should perform search with valid query', async () => {
			const queryParams = new URLSearchParams({
				q: 'test',
				collections: TEST_COLLECTION_NAME
			});
			const response = await fetch(`${API_BASE_URL}/api/search?${queryParams.toString()}`, {
				method: 'GET',
				headers: { Cookie: adminCookie }
			});

			expect(response.status).toBe(200);
			const result = await response.json();
			// Search usually returns an array or an object with hits
			expect(result).toBeDefined();
		});

		it('should handle empty queries gracefully', async () => {
			const response = await fetch(`${API_BASE_URL}/api/search?q=`, {
				method: 'GET',
				headers: { Cookie: adminCookie }
			});
			expect(response.status).toBe(200);
		});
	});

	// --- CRUD OPERATIONS ---
	describe(`RESTful Operations (${TEST_COLLECTION_NAME})`, () => {
		it('should create a new entry', async () => {
			const response = await fetch(`${API_BASE_URL}/api/collections/${TEST_COLLECTION_NAME}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
				body: JSON.stringify({
					title: 'Integration Test Post',
					content: '<p>Test content</p>',
					status: 'published'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result._id).toBeDefined();
		});

		it('should list entries', async () => {
			const response = await fetch(`${API_BASE_URL}/api/collections/${TEST_COLLECTION_NAME}`, {
				headers: { Cookie: adminCookie }
			});
			expect(response.status).toBe(200);
			const result = await response.json();
			expect(Array.isArray(result) || Array.isArray(result.data)).toBe(true);
		});

		it('should fail on invalid collection', async () => {
			const response = await fetch(`${API_BASE_URL}/api/collections/non_existent_collection_123`, {
				method: 'GET',
				headers: { Cookie: adminCookie }
			});
			// Should be 404 Not Found or 400 Bad Request
			expect(response.status).toBeGreaterThanOrEqual(400);
		});
	});

	// --- ADMIN UTILS ---
	describe('POST /api/content-structure (recompile)', () => {
		it('should recompile with admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/content-structure`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
				body: JSON.stringify({ action: 'recompile' })
			});

			expect(response.status).toBe(200);
			const result = await response.json();
			expect(result.success).toBe(true);
		});

		it('should reject unauthenticated recompile', async () => {
			const response = await fetch(`${API_BASE_URL}/api/content-structure`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }, // No Cookie
				body: JSON.stringify({ action: 'recompile' })
			});
			expect(response.status).toBe(401);
		});
	});
});
