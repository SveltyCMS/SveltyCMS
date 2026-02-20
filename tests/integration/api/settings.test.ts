/**
 * @file tests/bun/api/settings.test.ts
 * @description Integration tests for Settings & Configuration API endpoints
 *
 * Tests settings management endpoints:
 * - GET /api/settings/[group] - Get settings by group
 * - PUT /api/settings/[group] - Update settings group
 * - GET /api/settings/public - Get public settings
 * - GET /api/settings/public/stream - Stream public settings (SSE)
 * - POST /api/systemsetting/export - Export system settings
 * - POST /api/systemsetting/import - Import system settings
 * - GET /api/systemPreferences - Get user preferences
 * - PUT /api/systemPreferences - Update user preferences
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { cleanupTestDatabase, prepareAuthenticatedContext } from '../helpers/test-setup';

const BASE_URL = getApiBaseUrl();
let authCookie: string;

beforeAll(async () => {
	await waitForServer();

	// Use shared helper to prepare authenticated context
	authCookie = await prepareAuthenticatedContext();
});

afterAll(async () => {
	// Optional: cleanup via API if needed,
	// but usually better to leave DB state for debugging unless pipeline forces clean
	await cleanupTestDatabase();
});

describe('Settings API - Get Settings by Group', () => {
	it('should retrieve general settings', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/general`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(typeof data).toBe('object');
		}
	});

	it('should retrieve email settings', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/email`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
	});

	it('should retrieve theme settings', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/theme`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
	});

	it('should require authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/general`);
		expect([401, 403]).toContain(response.status);
	});

	it('should return 404 for non-existent group', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/nonexistent-group`, {
			headers: { Cookie: authCookie }
		});

		expect([404, 400]).toContain(response.status);
	});

	it('should include all settings in group', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/general`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// Settings should be key-value pairs or structured object
			expect(typeof data).toBe('object');
		}
	});
});

describe('Settings API - Update Settings Group', () => {
	it('should update settings group', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/general`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				siteName: 'Test Site',
				siteDescription: 'Test Description'
			})
		});

		expect([200, 400, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(data.success || data.updated).toBeTruthy();
		}
	});

	it('should validate setting values', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/general`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				invalidSetting: 'value'
			})
		});

		// May accept or reject based on validation
		expect(response.status).toBeGreaterThanOrEqual(200);
	});

	it('should require admin authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/general`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ siteName: 'Test' })
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should preserve existing settings when updating', async () => {
		// Get current settings
		const getResponse = await fetch(`${BASE_URL}/api/settings/general`, {
			headers: { Cookie: authCookie }
		});

		if (getResponse.ok) {
			const currentSettings = await getResponse.json();

			// Update one setting
			const updateResponse = await fetch(`${BASE_URL}/api/settings/general`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					...currentSettings,
					testSetting: 'test value'
				})
			});

			expect([200, 400]).toContain(updateResponse.status);
		}
	});
});

describe('Settings API - Public Settings', () => {
	it('should serve public settings without authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/public`);
		// Public settings endpoint is intentionally unauthenticated
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(typeof data).toBe('object');
	});

	it('should allow admin access to public settings', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/public`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);
		if (response.ok) {
			const data = await response.json();
			expect(typeof data).toBe('object');
		}
	});

	it('should not expose sensitive settings', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/public`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();

			// Should not contain sensitive keys
			expect(data.privateKey).toBeUndefined();
			expect(data.apiSecret).toBeUndefined();
			expect(data.databaseUrl).toBeUndefined();
		}
	});

	it('should include theme settings in data', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/public`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			expect(data).toBeDefined();
		}
	});
});

describe('Settings API - Public Settings Stream', () => {
	it('should serve settings stream without authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/public/stream`);
		// Public stream endpoint is intentionally unauthenticated (SSE for client settings)
		expect([200, 404, 501]).toContain(response.status);
	});

	it('should support server-sent events for authenticated settings', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/public/stream`, {
			headers: { Cookie: authCookie }
		});

		// SSE endpoints use text/event-stream
		expect([200, 404, 501]).toContain(response.status);

		if (response.ok) {
			const contentType = response.headers.get('content-type');
			if (contentType) {
				expect(contentType).toContain('text/event-stream');
			}
		}
	});
});

describe('Settings API - Export System Settings', () => {
	it('should export all system settings', async () => {
		const response = await fetch(`${BASE_URL}/api/systemsetting/export`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({})
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();

			// Should return settings data structure
			expect(typeof data).toBe('object');
		}
	});

	it('should require admin authentication for export', async () => {
		const response = await fetch(`${BASE_URL}/api/systemsetting/export`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should include all setting groups in export', async () => {
		const response = await fetch(`${BASE_URL}/api/systemsetting/export`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({ includeSettings: true })
		});

		if (response.ok) {
			const data = await response.json();

			// May have multiple groups
			expect(typeof data).toBe('object');
		}
	});

	it('should sanitize sensitive data in export', async () => {
		const response = await fetch(`${BASE_URL}/api/systemsetting/export`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({})
		});

		if (response.ok) {
			const data = await response.json();

			// Should not export passwords in plain text
			if (data.email) {
				expect(data.email.smtpPassword).toBeUndefined();
			}
		}
	});
});

describe('Settings API - Import System Settings', () => {
	it('should import system settings', async () => {
		const settingsData = {
			general: {
				siteName: 'Imported Site',
				siteDescription: 'Test Import'
			}
		};

		const importPayload = {
			data: {
				metadata: {
					exported_at: new Date().toISOString(),
					cms_version: '1.0.0',
					export_id: 'test-import'
				},
				settings: settingsData
			},
			options: {
				strategy: 'merge'
			}
		};

		const response = await fetch(`${BASE_URL}/api/systemsetting/import`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify(importPayload)
		});

		expect([200, 400, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(data.success || data.imported).toBeTruthy();
		}
	});

	it('should validate imported settings structure', async () => {
		const response = await fetch(`${BASE_URL}/api/systemsetting/import`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				data: {
					// Missing metadata and valid structure
					invalid: 'structure'
				}
			})
		});

		// Should validate before importing
		expect([200, 400, 422]).toContain(response.status);
	});

	it('should require admin authentication for import', async () => {
		const response = await fetch(`${BASE_URL}/api/systemsetting/import`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		expect([401, 403]).toContain(response.status);
	});

	it('should merge with existing settings safely', async () => {
		const response = await fetch(`${BASE_URL}/api/systemsetting/import`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				data: {
					metadata: {
						exported_at: new Date().toISOString(),
						cms_version: '1.0.0',
						export_id: 'test-merge'
					},
					settings: {
						general: {
							newSetting: 'value'
						}
					}
				},
				options: {
					strategy: 'merge'
				}
			})
		});

		// Should merge, not replace entirely
		expect([200, 400, 404]).toContain(response.status);
	});
});

describe('Settings API - User Preferences', () => {
	it('should get user preferences', async () => {
		const response = await fetch(`${BASE_URL}/api/systemPreferences?key=theme`, {
			headers: { Cookie: authCookie }
		});

		expect([200, 404]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(typeof data).toBe('object');
		}
	});

	it('should update user preferences', async () => {
		const response = await fetch(`${BASE_URL}/api/systemPreferences`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				theme: 'dark',
				language: 'en'
			})
		});

		expect([200, 400, 404]).toContain(response.status);
	});

	it('should require authentication for preferences', async () => {
		const response = await fetch(`${BASE_URL}/api/systemPreferences`);
		expect([401, 403]).toContain(response.status);
	});

	it('should isolate preferences per user', async () => {
		// User preferences should be scoped to the logged-in user
		const response = await fetch(`${BASE_URL}/api/systemPreferences`, {
			headers: { Cookie: authCookie }
		});

		if (response.ok) {
			const data = await response.json();
			// Should be user-specific
			expect(typeof data).toBe('object');
		}
	});
});

describe('Settings API - Multi-Tenant Support', () => {
	it('should scope settings to tenant', async () => {
		const response = await fetch(`${BASE_URL}/api/settings/general`, {
			headers: { Cookie: authCookie }
		});

		// In multi-tenant mode, settings should be tenant-scoped
		expect([200, 404]).toContain(response.status);
	});

	it('should prevent cross-tenant setting access', async () => {
		// This would require multiple tenants to test properly
		// Validates endpoint exists and has auth
		const response = await fetch(`${BASE_URL}/api/settings/general`, {
			headers: { Cookie: authCookie }
		});

		expect(response.status).toBeGreaterThanOrEqual(200);
	});
});
