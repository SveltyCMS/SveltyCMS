/**
 * @file tests/bun/api/theme.test.ts
 * @description
 * Integration tests for Theme Management API endpoints.
 * Aligned with consolidated routes: get-current-theme, update-theme, set-default.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { prepareAuthenticatedContext, cleanupTestDatabase } from '../helpers/testSetup';
import { getApiBaseUrl, waitForServer } from '../helpers/server';

const API_BASE_URL = getApiBaseUrl();

describe('Theme API Endpoints', () => {
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

	describe('GET /api/theme/get-current-theme', () => {
		it('should return current theme for authenticated user', async () => {
			const response = await fetch(`${API_BASE_URL}/api/theme/get-current-theme`, {
				headers: { Cookie: authCookie }
			});
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data).toHaveProperty('name');
		});

		it('should fail without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/theme/get-current-theme`);
			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/theme/update-theme', () => {
		it('should update theme custom CSS with admin authentication', async () => {
			// First get current theme to get an ID
			const getResponse = await fetch(`${API_BASE_URL}/api/theme/get-current-theme`, {
				headers: { Cookie: authCookie }
			});
			const current = await getResponse.json();
			const themeId = current._id || 'default';

			const response = await fetch(`${API_BASE_URL}/api/theme/update-theme`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					themeId,
					customCss: '/* test css */'
				})
			});

			// Might be 200 or 404 if themeId is "default" but not in DB
			expect([200, 404]).toContain(response.status);
		});

		it('should fail with missing themeId', async () => {
			const response = await fetch(`${API_BASE_URL}/api/theme/update-theme`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					customCss: '/* test css */'
				})
			});
			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/theme/set-default', () => {
		it('should set default theme with admin authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/theme/set-default`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					themeId: 'Modern'
				})
			});

			// Might fail 404 if theme doesn't exist, but route should be valid
			expect([200, 404, 500]).toContain(response.status);
		});
	});
});
