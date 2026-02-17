/**
 * @file tests/bun/api/system.test.ts
 * @description
 * Integration tests for system-wide configuration and maintenance.
 * Aligned with api/settings/[group] and consolidated system health endpoints.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { cleanupTestDatabase, prepareAuthenticatedContext } from '../helpers/testSetup';

const API_BASE_URL = getApiBaseUrl();

describe('System Configuration API Endpoints', () => {
	let authCookie: string;

	beforeAll(async () => {
		await waitForServer();
	});

	afterAll(async () => {
		await cleanupTestDatabase();
	});

	beforeEach(async () => {
		authCookie = await prepareAuthenticatedContext();
	});

	describe('GET /api/settings/site', () => {
		it('should return site settings with authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/settings/site`, {
				headers: { Cookie: authCookie }
			});
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
			expect(data).toHaveProperty('values');
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/settings/site`);
			expect(response.status).toBe(401);
		});
	});

	describe('PUT /api/settings/site', () => {
		it('should update site settings with admin authentication', async () => {
			// First get current values to preserve others
			const getResponse = await fetch(`${API_BASE_URL}/api/settings/site`, {
				headers: { Cookie: authCookie }
			});
			const current = await getResponse.json();
			const siteName = current.values.SITE_NAME || 'SveltyCMS';

			const response = await fetch(`${API_BASE_URL}/api/settings/site`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					SITE_NAME: `${siteName} (Updated)`
				})
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
		});

		it('should fail with invalid setting keys', async () => {
			const response = await fetch(`${API_BASE_URL}/api/settings/site`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					INVALID_KEY: 'some value'
				})
			});
			expect(response.status).toBe(400);
		});
	});

	describe('System Preferences (User-scoped)', () => {
		it('should handle single preference GET/POST', async () => {
			const key = `test.pref.${Date.now()}`;
			const value = { some: 'data' };

			// POST
			const postResp = await fetch(`${API_BASE_URL}/api/systemPreferences`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({ key, value })
			});
			expect(postResp.status).toBe(200);

			// GET
			const getResp = await fetch(`${API_BASE_URL}/api/systemPreferences?key=${key}`, {
				headers: { Cookie: authCookie }
			});
			expect(getResp.status).toBe(200);
			const data = await getResp.json();
			// The API returns the preference value directly, not wrapped in { value: ... }
			expect(data).toEqual(value);
		});
	});
});
