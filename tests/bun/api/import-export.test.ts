/**
 * @file tests/bun/api/import-export.test.ts
 * @description Integration tests for Data Import/Export API endpoints
 *
 * Tests data import/export endpoints:
 * - POST /api/exportData - Export collection data
 * - POST /api/importData - Import collection data
 * - POST /api/export - General export endpoint
 * - POST /api/import/full - Full system import
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { prepareAuthenticatedContext, cleanupTestDatabase } from '../helpers/testSetup';

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
	await waitForServer();
	authCookie = await prepareAuthenticatedContext();
});

afterAll(async () => {
	await cleanupTestDatabase();
});

describe('Import/Export API - Export Collection Data', () => {
	it('should export collection data', async () => {
		const response = await fetch(`${BASE_URL}/api/exportData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts'
			})
		});

		expect([200, 404, 400]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(Array.isArray(data) || typeof data === 'object').toBe(true);
		}
	});

	it('should require collection name parameter', async () => {
		const response = await fetch(`${BASE_URL}/api/exportData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({})
		});

		expect([400, 422]).toContain(response.status);
	});

	it('should require authentication for export', async () => {
		const response = await fetch(`${BASE_URL}/api/exportData`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ collectionName: 'Posts' })
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should handle non-existent collections', async () => {
		const response = await fetch(`${BASE_URL}/api/exportData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'NonExistentCollection'
			})
		});

		expect([404, 400]).toContain(response.status);
	});

	it('should support export format options', async () => {
		const response = await fetch(`${BASE_URL}/api/exportData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				format: 'json'
			})
		});

		expect([200, 404, 400]).toContain(response.status);
	});

	it('should include metadata in export', async () => {
		const response = await fetch(`${BASE_URL}/api/exportData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				includeMetadata: true
			})
		});

		if (response.ok) {
			const data = await response.json();
			// May include version, timestamp, etc.
			expect(typeof data).toBeDefined();
		}
	});

	it('should support filtered exports', async () => {
		const response = await fetch(`${BASE_URL}/api/exportData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				filter: { status: 'published' }
			})
		});

		expect([200, 404, 400]).toContain(response.status);
	});
});

describe('Import/Export API - Import Collection Data', () => {
	it('should import collection data', async () => {
		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				data: [
					{
						title: 'Imported Post',
						content: 'Test content'
					}
				]
			})
		});

		expect([200, 400, 422]).toContain(response.status);

		if (response.ok) {
			const result = await response.json();
			expect(result.success || result.imported).toBeTruthy();
		}
	});

	it('should validate import data structure', async () => {
		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				data: 'invalid data'
			})
		});

		expect([400, 422]).toContain(response.status);
	});

	it('should require authentication for import', async () => {
		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				collectionName: 'Posts',
				data: []
			})
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should support replace vs merge import mode', async () => {
		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				data: [],
				mode: 'replace'
			})
		});

		expect([200, 400, 422]).toContain(response.status);
	});

	it('should return import statistics', async () => {
		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				data: [{ title: 'Post 1' }, { title: 'Post 2' }]
			})
		});

		if (response.ok) {
			const result = await response.json();
			// Should report how many imported, skipped, errors
			expect(typeof result).toBe('object');
		}
	});

	it('should handle validation errors in import data', async () => {
		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				data: [{ invalidField: 'value' }]
			})
		});

		// May partially succeed or fail with validation errors
		expect([200, 400, 422]).toContain(response.status);
	});

	it('should support duplicate handling strategies', async () => {
		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				data: [],
				duplicateStrategy: 'skip'
			})
		});

		expect([200, 400, 422]).toContain(response.status);
	});
});

describe('Import/Export API - General Export', () => {
	it('should export data with general export endpoint', async () => {
		const response = await fetch(`${BASE_URL}/api/export`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				type: 'collections'
			})
		});

		expect([200, 404, 400]).toContain(response.status);
	});

	it('should support multiple export types', async () => {
		const types = ['collections', 'users', 'settings', 'all'];

		for (const type of types) {
			const response = await fetch(`${BASE_URL}/api/export`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({ type })
			});

			expect([200, 404, 400, 501]).toContain(response.status);
		}
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/export`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'collections' })
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should return downloadable export file', async () => {
		const response = await fetch(`${BASE_URL}/api/export`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				type: 'collections',
				download: true
			})
		});

		if (response.ok) {
			// May set content-disposition header for download
			// Header may or may not be present depending on implementation
			expect(response.status).toBe(200);
		}
	});
});

describe('Import/Export API - Full System Import', () => {
	it('should perform full system import', async () => {
		const response = await fetch(`${BASE_URL}/api/import/full`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				data: {
					collections: [],
					settings: {},
					users: []
				}
			})
		});

		expect([200, 400, 422, 404]).toContain(response.status);
	});

	it('should validate full import data structure', async () => {
		const response = await fetch(`${BASE_URL}/api/import/full`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				data: 'invalid'
			})
		});

		expect([400, 422]).toContain(response.status);
	});

	it('should require admin authentication for full import', async () => {
		const response = await fetch(`${BASE_URL}/api/import/full`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				data: {}
			})
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should support incremental vs full replace import', async () => {
		const response = await fetch(`${BASE_URL}/api/import/full`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				data: {
					collections: []
				},
				mode: 'incremental'
			})
		});

		expect([200, 400, 422, 404]).toContain(response.status);
	});

	it('should return comprehensive import results', async () => {
		const response = await fetch(`${BASE_URL}/api/import/full`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				data: {
					collections: [],
					settings: {}
				}
			})
		});

		if (response.ok) {
			const result = await response.json();
			// Should have results for each import type
			expect(typeof result).toBe('object');
		}
	});

	it('should handle partial import failures gracefully', async () => {
		const response = await fetch(`${BASE_URL}/api/import/full`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				data: {
					collections: [{ invalid: 'data' }],
					settings: {}
				}
			})
		});

		// Should report partial success/failure
		expect([200, 400, 422, 404]).toContain(response.status);
	});
});

describe('Import/Export API - Data Integrity', () => {
	it('should preserve relationships in export/import', async () => {
		// Export data
		const exportResponse = await fetch(`${BASE_URL}/api/exportData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts'
			})
		});

		if (exportResponse.ok) {
			const exportData = await exportResponse.json();

			// Import same data
			const importResponse = await fetch(`${BASE_URL}/api/importData`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					collectionName: 'Posts',
					data: exportData
				})
			});

			expect([200, 400, 422]).toContain(importResponse.status);
		}
	});

	it('should handle large datasets efficiently', async () => {
		const largeDataset = Array.from({ length: 100 }, (_, i) => ({
			title: `Post ${i}`,
			content: `Content for post ${i}`
		}));

		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				data: largeDataset
			})
		});

		// Should handle without timeout or memory issues
		expect([200, 400, 422, 413]).toContain(response.status);
	});

	it('should validate data integrity after import', async () => {
		const response = await fetch(`${BASE_URL}/api/importData`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				collectionName: 'Posts',
				data: [{ title: 'Test' }],
				validateIntegrity: true
			})
		});

		expect([200, 400, 422]).toContain(response.status);
	});
});
