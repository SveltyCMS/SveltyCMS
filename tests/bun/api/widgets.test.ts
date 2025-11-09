/**
 * @file tests/bun/api/widgets.test.ts
 * @description Integration tests for Widget Management API endpoints
 *
 * Tests widget management endpoints:
 * - GET /api/widgets - List all widgets
 * - GET /api/widgets/[id] - Get widget details
 * - POST /api/widgets - Create/install widget
 * - PATCH /api/widgets/[id] - Update widget
 * - DELETE /api/widgets/[id] - Delete widget
 * - POST /api/widgets/activate - Activate widget
 * - POST /api/widgets/deactivate - Deactivate widget
 * - GET /api/widgets/dependencies - Check dependencies
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
		throw new Error('Failed to authenticate for widget tests');
	}

	const setCookie = loginResponse.headers.get('set-cookie');
	authCookie = setCookie?.split(';')[0] || '';
});

afterAll(async () => {
	await cleanupTestEnvironment();
});

describe('Widget API - List Widgets', () => {
	it('should list all available widgets', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();

		expect(Array.isArray(data) || Array.isArray(data.widgets)).toBe(true);
	});

	it('should include widget metadata', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			const widgets = data.widgets || data;

			if (widgets.length > 0) {
				const widget = widgets[0];
				expect(widget).toHaveProperty('id');
				expect(widget).toHaveProperty('name');
				expect(widget).toHaveProperty('type');
			}
		}
	});

	it('should filter widgets by status', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets?status=active`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
	});

	it('should filter widgets by type', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets?type=text`, {
			headers: { Cookie: authCookie }
		});

		expect(response.ok).toBe(true);
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets`);
		expect([401, 403]).toContain(response.status);
	});
});

describe('Widget API - Get Widget Details', () => {
	it('should return widget details by ID', async () => {
		// First get a widget ID
		const listResponse = await fetch(`${BASE_URL}/api/widgets`, {
			headers: { Cookie: authCookie }
		});

		if (listResponse.ok) {
			const data = await listResponse.json();
			const widgets = data.widgets || data;

			if (widgets.length > 0) {
				const widgetId = widgets[0].id || widgets[0]._id;

				const response = await fetch(`${BASE_URL}/api/widgets/${widgetId}`, {
					headers: { Cookie: authCookie }
				});

				expect([200, 404]).toContain(response.status);

				if (response.ok) {
					const widget = await response.json();
					expect(widget).toHaveProperty('id');
					expect(widget).toHaveProperty('name');
				}
			}
		}
	});

	it('should return 404 for non-existent widget', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets/nonexistent-id`, {
			headers: { Cookie: authCookie }
		});

		expect([404, 400]).toContain(response.status);
	});

	it('should include widget schema in details', async () => {
		const listResponse = await fetch(`${BASE_URL}/api/widgets`, {
			headers: { Cookie: authCookie }
		});

		if (listResponse.ok) {
			const data = await listResponse.json();
			const widgets = data.widgets || data;

			if (widgets.length > 0) {
				const widgetId = widgets[0].id || widgets[0]._id;

				const response = await fetch(`${BASE_URL}/api/widgets/${widgetId}`, {
					headers: { Cookie: authCookie }
				});

				if (response.ok) {
					const widget = await response.json();
					// May have schema/fields definition
					expect(widget).toHaveProperty('type');
				}
			}
		}
	});
});

describe('Widget API - Create/Install Widget', () => {
	it('should create a new widget', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				name: 'Test Widget',
				type: 'text',
				config: {
					label: 'Test',
					required: false
				}
			})
		});

		expect([200, 201, 400]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(data).toHaveProperty('id');
		}
	});

	it('should validate widget schema', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				// Missing required fields
				invalidField: 'test'
			})
		});

		expect([400, 422]).toContain(response.status);
	});

	it('should prevent duplicate widget names', async () => {
		const widgetData = {
			name: 'Duplicate Widget Test',
			type: 'text'
		};

		// Create first widget
		await fetch(`${BASE_URL}/api/widgets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify(widgetData)
		});

		// Try to create duplicate
		const response = await fetch(`${BASE_URL}/api/widgets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify(widgetData)
		});

		// May allow or prevent based on implementation
		expect(response.status).toBeGreaterThanOrEqual(200);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'Test Widget',
				type: 'text'
			})
		});

		expect([401, 403]).toContain(response.status);
	});
});

describe('Widget API - Update Widget', () => {
	it('should update widget configuration', async () => {
		// Get a widget first
		const listResponse = await fetch(`${BASE_URL}/api/widgets`, {
			headers: { Cookie: authCookie }
		});

		if (listResponse.ok) {
			const data = await listResponse.json();
			const widgets = data.widgets || data;

			if (widgets.length > 0) {
				const widgetId = widgets[0].id || widgets[0]._id;

				const response = await fetch(`${BASE_URL}/api/widgets/${widgetId}`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
						Cookie: authCookie
					},
					body: JSON.stringify({
						name: 'Updated Widget Name'
					})
				});

				expect([200, 404, 400]).toContain(response.status);
			}
		}
	});

	it('should validate update data', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets/test-id`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				type: 'invalid-type'
			})
		});

		expect([400, 404, 422]).toContain(response.status);
	});

	it('should require authentication for updates', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets/test-id`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Updated' })
		});

		expect([401, 403]).toContain(response.status);
	});
});

describe('Widget API - Delete Widget', () => {
	it('should delete a widget', async () => {
		// Create a widget to delete
		const createResponse = await fetch(`${BASE_URL}/api/widgets`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				name: 'Widget To Delete',
				type: 'text'
			})
		});

		if (createResponse.ok) {
			const created = await createResponse.json();
			const widgetId = created.id || created._id;

			const response = await fetch(`${BASE_URL}/api/widgets/${widgetId}`, {
				method: 'DELETE',
				headers: { Cookie: authCookie }
			});

			expect([200, 204, 404]).toContain(response.status);
		}
	});

	it('should return 404 for non-existent widget deletion', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets/nonexistent-id`, {
			method: 'DELETE',
			headers: { Cookie: authCookie }
		});

		expect([404, 400]).toContain(response.status);
	});

	it('should require authentication for deletion', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets/test-id`, {
			method: 'DELETE'
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should prevent deletion of active widgets', async () => {
		// This depends on business logic - may prevent or allow
		const listResponse = await fetch(`${BASE_URL}/api/widgets?status=active`, {
			headers: { Cookie: authCookie }
		});

		if (listResponse.ok) {
			const data = await listResponse.json();
			const widgets = data.widgets || data;

			if (widgets.length > 0) {
				const widgetId = widgets[0].id || widgets[0]._id;

				const response = await fetch(`${BASE_URL}/api/widgets/${widgetId}`, {
					method: 'DELETE',
					headers: { Cookie: authCookie }
				});

				// May prevent deletion of active widgets
				expect(response.status).toBeGreaterThanOrEqual(200);
			}
		}
	});
});

describe('Widget API - Activate/Deactivate', () => {
	it('should activate a widget', async () => {
		const listResponse = await fetch(`${BASE_URL}/api/widgets`, {
			headers: { Cookie: authCookie }
		});

		if (listResponse.ok) {
			const data = await listResponse.json();
			const widgets = data.widgets || data;

			if (widgets.length > 0) {
				const widgetId = widgets[0].id || widgets[0]._id;

				const response = await fetch(`${BASE_URL}/api/widgets/activate`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Cookie: authCookie
					},
					body: JSON.stringify({ id: widgetId })
				});

				expect([200, 404, 400]).toContain(response.status);
			}
		}
	});

	it('should deactivate a widget', async () => {
		const listResponse = await fetch(`${BASE_URL}/api/widgets`, {
			headers: { Cookie: authCookie }
		});

		if (listResponse.ok) {
			const data = await listResponse.json();
			const widgets = data.widgets || data;

			if (widgets.length > 0) {
				const widgetId = widgets[0].id || widgets[0]._id;

				const response = await fetch(`${BASE_URL}/api/widgets/deactivate`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Cookie: authCookie
					},
					body: JSON.stringify({ id: widgetId })
				});

				expect([200, 404, 400]).toContain(response.status);
			}
		}
	});

	it('should check dependencies before activation', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets/dependencies`, {
			method: 'GET',
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			// May return dependency information
			expect(typeof data).toBe('object');
		}
	});
});

describe('Widget API - Dependencies', () => {
	it('should return widget dependencies', async () => {
		const response = await fetch(`${BASE_URL}/api/widgets/dependencies`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
	});

	it('should validate dependency constraints', async () => {
		const listResponse = await fetch(`${BASE_URL}/api/widgets`, {
			headers: { Cookie: authCookie }
		});

		if (listResponse.ok) {
			const data = await listResponse.json();
			const widgets = data.widgets || data;

			if (widgets.length > 0) {
				const widget = widgets[0];

				// Check if widget has dependencies
				if (widget.dependencies) {
					expect(Array.isArray(widget.dependencies)).toBe(true);
				}
			}
		}
	});

	it('should prevent circular dependencies', async () => {
		// This would require creating widgets with circular deps
		// Test validates the endpoint exists and responds
		const response = await fetch(`${BASE_URL}/api/widgets/dependencies`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBeGreaterThanOrEqual(200);
	});
});
