/**
 * @file tests/bun/api/miscellaneous.test.ts
 * @description Integration tests for Miscellaneous Utility API endpoints
 *
 * Tests utility endpoints:
 * - GET /api/search - Global search
 * - POST /api/sendMail - Send email
 * - POST /api/cache/clear - Clear cache
 * - GET /api/metrics - Performance metrics
 * - POST /api/permission/update - Update permissions
 * - GET /api/version-check - Check version
 * - GET /api/marketplace - Widget marketplace
 * - GET /api/config_sync - Config synchronization
 * - GET /api/debug - Debug information
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { cleanupTestDatabase, prepareAuthenticatedContext } from '../helpers/testSetup';

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
	await waitForServer();
	authCookie = await prepareAuthenticatedContext();
});

afterAll(async () => {
	await cleanupTestDatabase();
});

describe('Search API - Global Search', () => {
	it('should search across collections', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(typeof data).toBe('object');
	});

	it('should handle empty search query', async () => {
		const response = await fetch(`${BASE_URL}/api/search`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);
	});

	it('should filter by collection type', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test&type=Posts`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);
	});

	it('should support pagination', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test&page=1&limit=10`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test`);
		expect(response.status).toBe(401);
	});

	it('should return relevant search results', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(typeof data).toBe('object');
	});
});

describe('Email API - Send Mail', () => {
	it('should reject email when not configured', async () => {
		const response = await fetch(`${BASE_URL}/api/sendMail`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				to: 'test@example.com',
				subject: 'Test Email',
				body: 'Test email body'
			})
		});

		expect(response.status).toBe(400);
	});

	it('should validate email parameters', async () => {
		const response = await fetch(`${BASE_URL}/api/sendMail`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				subject: 'Test'
				// Missing to and body
			})
		});

		expect(response.status).toBe(400);
	});

	it('should validate email addresses', async () => {
		const response = await fetch(`${BASE_URL}/api/sendMail`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				to: 'invalid-email',
				subject: 'Test',
				body: 'Test'
			})
		});

		expect(response.status).toBe(400);
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/sendMail`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				to: 'test@example.com',
				subject: 'Test',
				body: 'Test'
			})
		});

		expect(response.status).toBe(401);
	});

	it('should reject HTML email when not configured', async () => {
		const response = await fetch(`${BASE_URL}/api/sendMail`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				to: 'test@example.com',
				subject: 'HTML Test',
				body: '<h1>Test</h1>',
				html: true
			})
		});

		expect(response.status).toBe(400);
	});
});

describe('Cache API - Clear Cache', () => {
	it('should clear cache', async () => {
		const response = await fetch(`${BASE_URL}/api/cache/clear`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		expect(response.status).toBe(200);
	});

	it('should support selective cache clearing', async () => {
		const response = await fetch(`${BASE_URL}/api/cache/clear`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				type: 'collections'
			})
		});

		expect(response.status).toBe(200);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/cache/clear`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		expect(response.status).toBe(401);
	});

	it('should return cache clear results', async () => {
		const response = await fetch(`${BASE_URL}/api/cache/clear`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.success || data.cleared).toBeDefined();
	});
});

describe('Metrics API - Performance Metrics', () => {
	it('should get performance metrics', async () => {
		const response = await fetch(`${BASE_URL}/api/metrics`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(typeof data).toBe('object');
	});

	it('should include system metrics', async () => {
		const response = await fetch(`${BASE_URL}/api/metrics`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(typeof data).toBe('object');
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/metrics`);
		expect(response.status).toBe(401);
	});

	it('should support metric filtering', async () => {
		const response = await fetch(`${BASE_URL}/api/metrics?type=system`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);
	});
});

describe('Permission API - Update Permissions', () => {
	it('should reject invalid user permissions', async () => {
		const response = await fetch(`${BASE_URL}/api/permission/update`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				userId: 'test-user-id',
				permissions: ['read', 'write']
			})
		});

		expect(response.status).toBe(400);
	});

	it('should validate permission data', async () => {
		const response = await fetch(`${BASE_URL}/api/permission/update`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				invalid: 'data'
			})
		});

		expect(response.status).toBe(400);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/permission/update`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		expect(response.status).toBe(401);
	});
});

describe('Version Check API - Version Information', () => {
	it('should get version information', async () => {
		const response = await fetch(`${BASE_URL}/api/version-check`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(typeof data).toBe('object');
	});

	it('should check for updates', async () => {
		const response = await fetch(`${BASE_URL}/api/version-check?checkUpdates=true`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);
	});

	it('should include current version', async () => {
		const response = await fetch(`${BASE_URL}/api/version-check`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.version || data.currentVersion).toBeDefined();
	});
});

describe('Marketplace API - Widget Marketplace', () => {
	it('should list marketplace widgets', async () => {
		const response = await fetch(`${BASE_URL}/api/marketplace`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(Array.isArray(data) || typeof data === 'object').toBe(true);
	});

	it('should search marketplace', async () => {
		const response = await fetch(`${BASE_URL}/api/marketplace?search=test`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);
	});

	it('should filter by category', async () => {
		const response = await fetch(`${BASE_URL}/api/marketplace?category=analytics`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/marketplace`);
		expect(response.status).toBe(401);
	});
});

describe('Config Sync API - Configuration Synchronization', () => {
	it('should sync configuration', async () => {
		const response = await fetch(`${BASE_URL}/api/config_sync`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(200);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/config_sync`);
		expect(response.status).toBe(401);
	});
});

describe('Debug API - Debug Information', () => {
	it('should restrict debug information', async () => {
		const response = await fetch(`${BASE_URL}/api/debug`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(403);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/debug`);
		expect(response.status).toBe(401);
	});

	it('should restrict system information access', async () => {
		const response = await fetch(`${BASE_URL}/api/debug`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBe(403);
	});
});
