/**
 * @file tests/bun/api/website-tokens.test.ts
 * @description
 * Integration test suite for Website Token API endpoints.
 * Covers creation with granular permissions and expiration, listing, and deletion.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

process.env.TEST_BASE_URL = 'http://localhost:5173';

import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { cleanupTestDatabase, prepareAuthenticatedContext } from '../helpers/testSetup';

const API_BASE_URL = getApiBaseUrl();

describe('Website Token API Endpoints', () => {
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

	describe('POST /api/website-tokens', () => {
		it('should create a website token with basic details', async () => {
			const tokenName = `Basic Token ${Date.now()}`;
			const response = await fetch(`${API_BASE_URL}/api/website-tokens`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					name: tokenName
				})
			});

			const result = await response.json();
			expect(response.status).toBe(201);
			expect(result.name).toBe(tokenName);
			expect(result.token).toBeDefined();
			expect(result.permissions).toEqual([]); // Default empty
		});

		it('should create a website token with granular permissions', async () => {
			const tokenName = `Perm Token ${Date.now()}`;
			const permissions = ['collection:read', 'user:create'];
			const response = await fetch(`${API_BASE_URL}/api/website-tokens`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					name: tokenName,
					permissions
				})
			});

			const result = await response.json();
			expect(response.status).toBe(201);
			expect(result.permissions).toEqual(permissions);
		});

		it('should create a website token with an expiration date', async () => {
			const tokenName = `Expiring Token ${Date.now()}`;
			const expiresAt = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
			const response = await fetch(`${API_BASE_URL}/api/website-tokens`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					name: tokenName,
					expiresAt
				})
			});

			const result = await response.json();
			expect(response.status).toBe(201);
			// Compare up to seconds (some DBs like MariaDB don't store milliseconds)
			expect(result.expiresAt.slice(0, 19)).toBe(expiresAt.slice(0, 19));
		});

		it('should fail to create token without a name', async () => {
			const response = await fetch(`${API_BASE_URL}/api/website-tokens`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					permissions: []
				})
			});

			expect(response.status).toBe(400);
		});

		it('should reject unauthenticated requests', async () => {
			const response = await fetch(`${API_BASE_URL}/api/website-tokens`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Unauth Token' })
			});

			expect(response.status).toBe(401);
		});
	});

	describe('GET /api/website-tokens', () => {
		it('should list created tokens', async () => {
			// Create a token first
			const tokenName = `List Token ${Date.now()}`;
			await fetch(`${API_BASE_URL}/api/website-tokens`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({ name: tokenName })
			});

			const response = await fetch(`${API_BASE_URL}/api/website-tokens`, {
				headers: { Cookie: authCookie }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.data).toBeDefined();
			expect(Array.isArray(result.data)).toBe(true);

			const found = result.data.find((t: any) => t.name === tokenName);
			expect(found).toBeDefined();
		});
	});

	describe('DELETE /api/website-tokens/[id]', () => {
		it('should delete an existing token', async () => {
			// Create
			const createRes = await fetch(`${API_BASE_URL}/api/website-tokens`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({ name: `Delete Me ${Date.now()}` })
			});
			const createData = await createRes.json();
			const tokenId = createData._id;

			// Delete
			const deleteRes = await fetch(`${API_BASE_URL}/api/website-tokens/${tokenId}`, {
				method: 'DELETE',
				headers: { Cookie: authCookie }
			});
			expect(deleteRes.status).toBe(204);

			// Verify gone (List shouldn't have it)
			const listRes = await fetch(`${API_BASE_URL}/api/website-tokens`, {
				headers: { Cookie: authCookie }
			});
			const listData = await listRes.json();
			const found = listData.data.find((t: any) => t._id === tokenId);
			expect(found).toBeUndefined();
		});
	});
});
