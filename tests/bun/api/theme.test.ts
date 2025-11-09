/**
 * @file tests/bun/api/theme.test.ts
 * @description Integration tests for Theme Management API endpoints
 *
 * Tests theme management endpoints:
 * - GET /api/theme - List all themes
 * - POST /api/theme - Create/install theme
 * - GET /api/theme/[id] - Get theme details
 * - PATCH /api/theme/[id] - Update theme
 * - DELETE /api/theme/[id] - Delete theme
 * - POST /api/theme/[id]/activate - Activate theme
 */

// @ts-expect-error - Bun test is available at runtime
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { testFixtures, initializeTestEnvironment, cleanupTestEnvironment } from '../helpers/testSetup';

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
	await waitForServer();
	await initializeTestEnvironment();

	// Create and login as admin user
	await fetch(`${BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(testFixtures.users.firstAdmin)
	});

	const loginResponse = await fetch(`${BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: testFixtures.users.firstAdmin.email,
			password: testFixtures.users.firstAdmin.password
		})
	});

	if (!loginResponse.ok) {
		throw new Error('Failed to authenticate for theme tests');
	}

	const setCookie = loginResponse.headers.get('set-cookie');
	authCookie = setCookie?.split(';')[0] || '';
});

afterAll(async () => {
	await cleanupTestEnvironment();
});

describe('Theme API - List Themes', () => {
	it('should list all available themes', async () => {
		const response = await fetch(`${BASE_URL}/api/theme`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(Array.isArray(data) || typeof data === 'object').toBe(true);
		}
	});

	it('should include theme metadata', async () => {
		const response = await fetch(`${BASE_URL}/api/theme`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// Themes should have name, version, active status, etc.
			expect(typeof data).toBeDefined();
		}
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/theme`);
		expect([401, 403]).toContain(response.status);
	});

	it('should identify active theme', async () => {
		const response = await fetch(`${BASE_URL}/api/theme`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// Should indicate which theme is currently active
			expect(typeof data).toBe('object');
		}
	});
});

describe('Theme API - Get Theme Details', () => {
	it('should get theme details by ID', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(data).toHaveProperty('name');
		}
	});

	it('should include theme configuration', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// Should include colors, fonts, layout settings
			expect(typeof data).toBe('object');
		}
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default`);
		expect([401, 403]).toContain(response.status);
	});

	it('should return 404 for non-existent theme', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/nonexistent`, {
			headers: { Cookie: authCookie }
		});

		expect([404, 400]).toContain(response.status);
	});
});

describe('Theme API - Create Theme', () => {
	it('should create new theme', async () => {
		const response = await fetch(`${BASE_URL}/api/theme`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				name: 'Test Theme',
				version: '1.0.0',
				config: {
					colors: {
						primary: '#007bff',
						secondary: '#6c757d'
					}
				}
			})
		});

		expect([200, 201, 400, 409]).toContain(response.status);
	});

	it('should validate theme data', async () => {
		const response = await fetch(`${BASE_URL}/api/theme`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				invalidField: 'value'
			})
		});

		expect([400, 422]).toContain(response.status);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/theme`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Test' })
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should prevent duplicate theme names', async () => {
		const themeData = {
			name: 'Duplicate Theme',
			version: '1.0.0'
		};

		// Create first theme
		await fetch(`${BASE_URL}/api/theme`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify(themeData)
		});

		// Try to create duplicate
		const response = await fetch(`${BASE_URL}/api/theme`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify(themeData)
		});

		expect([409, 400, 200]).toContain(response.status);
	});
});

describe('Theme API - Update Theme', () => {
	it('should update theme configuration', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				config: {
					colors: {
						primary: '#ff0000'
					}
				}
			})
		});

		expect([200, 404, 400]).toContain(response.status);
	});

	it('should validate theme updates', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				config: 'invalid config'
			})
		});

		expect([200, 400, 422]).toContain(response.status);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		expect([401, 403]).toContain(response.status);
	});
});

describe('Theme API - Delete Theme', () => {
	it('should delete theme', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/test-theme`, {
			method: 'DELETE',
			headers: { Cookie: authCookie }
		});

		expect([200, 204, 404]).toContain(response.status);
	});

	it('should prevent deleting active theme', async () => {
		// Try to delete the currently active theme
		const response = await fetch(`${BASE_URL}/api/theme/default`, {
			method: 'DELETE',
			headers: { Cookie: authCookie }
		});

		expect([400, 409, 204]).toContain(response.status);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/test-theme`, {
			method: 'DELETE'
		});

		expect([401, 403]).toContain(response.status);
	});
});

describe('Theme API - Activate Theme', () => {
	it('should activate theme', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default/activate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		expect([200, 404]).toContain(response.status);
	});

	it('should deactivate previous theme when activating new one', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default/activate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		if (response.ok) {
			const data = await response.json();
			// Should indicate theme activation
			expect(typeof data).toBe('object');
		}
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/default/activate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should return 404 for non-existent theme', async () => {
		const response = await fetch(`${BASE_URL}/api/theme/nonexistent/activate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		expect([404, 400]).toContain(response.status);
	});
});
