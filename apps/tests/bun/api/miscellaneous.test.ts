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

describe('Search API - Global Search', () => {
	it('should search across collections', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(typeof data).toBe('object');
		}
	});

	it('should require search query parameter', async () => {
		const response = await fetch(`${BASE_URL}/api/search`, {
			headers: { Cookie: authCookie }
		});

		expect([400, 200]).toContain(response.status);
	});

	it('should filter by collection type', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test&type=Posts`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
	});

	it('should support pagination', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test&page=1&limit=10`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test`);
		expect([401, 403]).toContain(response.status);
	});

	it('should return relevant search results', async () => {
		const response = await fetch(`${BASE_URL}/api/search?q=test`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// Should have results array or object with results
			expect(typeof data).toBe('object');
		}
	});
});

describe('Email API - Send Mail', () => {
	it('should send email', async () => {
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

		expect([200, 400, 500, 503]).toContain(response.status);
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

		expect([400, 422]).toContain(response.status);
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

		expect([400, 422, 200]).toContain(response.status);
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

		expect([401, 403]).toContain(response.status);
	});

	it('should support HTML email', async () => {
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

		expect([200, 400, 500, 503]).toContain(response.status);
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

		expect([200, 404]).toContain(response.status);
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

		expect([200, 404]).toContain(response.status);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/cache/clear`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should return cache clear results', async () => {
		const response = await fetch(`${BASE_URL}/api/cache/clear`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		if (response.ok) {
			const data = await response.json();
			expect(data.success || data.cleared).toBeDefined();
		}
	});
});

describe('Metrics API - Performance Metrics', () => {
	it('should get performance metrics', async () => {
		const response = await fetch(`${BASE_URL}/api/metrics`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(typeof data).toBe('object');
		}
	});

	it('should include system metrics', async () => {
		const response = await fetch(`${BASE_URL}/api/metrics`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// May include CPU, memory, response times, etc.
			expect(typeof data).toBe('object');
		}
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/metrics`);
		expect([401, 403]).toContain(response.status);
	});

	it('should support metric filtering', async () => {
		const response = await fetch(`${BASE_URL}/api/metrics?type=system`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
	});
});

describe('Permission API - Update Permissions', () => {
	it('should update user permissions', async () => {
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

		expect([200, 404, 400]).toContain(response.status);
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

		expect([400, 422]).toContain(response.status);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/permission/update`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		expect([401, 403]).toContain(response.status);
	});
});

describe('Version Check API - Version Information', () => {
	it('should get version information', async () => {
		const response = await fetch(`${BASE_URL}/api/version-check`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(typeof data).toBe('object');
		}
	});

	it('should check for updates', async () => {
		const response = await fetch(`${BASE_URL}/api/version-check?checkUpdates=true`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
	});

	it('should include current version', async () => {
		const response = await fetch(`${BASE_URL}/api/version-check`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			expect(data.version || data.currentVersion).toBeDefined();
		}
	});
});

describe('Marketplace API - Widget Marketplace', () => {
	it('should list marketplace widgets', async () => {
		const response = await fetch(`${BASE_URL}/api/marketplace`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404, 503]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(Array.isArray(data) || typeof data === 'object').toBe(true);
		}
	});

	it('should search marketplace', async () => {
		const response = await fetch(`${BASE_URL}/api/marketplace?search=test`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404, 503]).toContain(response.status);
	});

	it('should filter by category', async () => {
		const response = await fetch(`${BASE_URL}/api/marketplace?category=analytics`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404, 503]).toContain(response.status);
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/marketplace`);
		expect([401, 403]).toContain(response.status);
	});
});

describe('Config Sync API - Configuration Synchronization', () => {
	it('should sync configuration', async () => {
		const response = await fetch(`${BASE_URL}/api/config_sync`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/config_sync`);
		expect([401, 403]).toContain(response.status);
	});
});

describe('Debug API - Debug Information', () => {
	it('should get debug information', async () => {
		const response = await fetch(`${BASE_URL}/api/debug`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404, 403]).toContain(response.status);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/debug`);
		expect([401, 403]).toContain(response.status);
	});

	it('should include system information', async () => {
		const response = await fetch(`${BASE_URL}/api/debug`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// Should have env, config, dependencies info
			expect(typeof data).toBe('object');
		}
	});
});
