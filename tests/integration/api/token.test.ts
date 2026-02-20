/**
 * @file tests/bun/api/token.test.ts
 * @description
 * Integration test suite for all token-related API endpoints.
 * This suite covers the creation, validation, deletion, and listing of invitation tokens,
 * ensuring that all operations are correctly protected by admin authentication.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { cleanupTestDatabase, prepareAuthenticatedContext } from '../helpers/test-setup';

const API_BASE_URL = getApiBaseUrl();

describe('Token API Endpoints', () => {
	let authCookie: string;

	beforeAll(async () => {
		await waitForServer();
	});

	afterAll(async () => {
		await cleanupTestDatabase();
	});

	// Before each test, clean the DB and get a fresh admin session
	beforeEach(async () => {
		authCookie = await prepareAuthenticatedContext();
	});

	describe('POST /api/token/createToken', () => {
		it('should create an invitation token with valid admin authentication', async () => {
			// Use unique email that doesn't exist in the system
			const uniqueEmail = `invite-test-${Date.now()}@example.com`;
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					email: uniqueEmail,
					role: 'editor', // Must be a valid role: admin, developer, or editor
					expiresIn: '2 days'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.token).toBeDefined();
		});

		it('should reject token creation without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'unauth-test@example.com',
					role: 'editor',
					expiresIn: '2 days'
				})
			});

			expect(response.status).toBe(401);
		});

		it('should reject token creation for an invalid email format', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({
					email: 'invalid-email',
					role: 'editor',
					expiresIn: '2 days'
				})
			});

			expect(response.status).toBe(400);
		});
	});

	describe('Token Validation and Deletion', () => {
		let invitationToken: string;
		let tokenEmail: string;

		// Before each test in this block, create a fresh invitation token with unique email
		beforeEach(async () => {
			tokenEmail = `validate-test-${Date.now()}@example.com`;
			const createResponse = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({
					email: tokenEmail,
					role: 'editor',
					expiresIn: '2 days'
				})
			});
			const createResult = await createResponse.json();
			invitationToken = createResult.token.value;
		});

		describe('GET /api/token/[tokenID]', () => {
			it('should validate an existing and valid token', async () => {
				const response = await fetch(`${API_BASE_URL}/api/token/${invitationToken}`);
				const result = await response.json();

				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
				expect(result.data.valid).toBe(true);
			});

			it('should return 404 for a non-existent token', async () => {
				const response = await fetch(`${API_BASE_URL}/api/token/non-existent-token`);
				expect(response.status).toBe(404);
			});
		});

		describe('DELETE /api/token/[tokenID]', () => {
			it('should delete a token with admin authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
					method: 'DELETE',
					headers: { Cookie: authCookie }
				});
				expect(response.status).toBe(200);

				// Verify the token is actually deleted
				const checkResponse = await fetch(`${API_BASE_URL}/api/token/${invitationToken}`);
				expect(checkResponse.status).toBe(404);
			});

			it('should reject deletion without authentication', async () => {
				const response = await fetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
					method: 'DELETE'
				});
				expect(response.status).toBe(401);
			});
		});
	});

	describe('GET /api/token', () => {
		it('should list all tokens with admin authentication', async () => {
			// Create a token to ensure the list is not empty
			const uniqueEmail = `list-test-${Date.now()}@example.com`;
			await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({
					email: uniqueEmail,
					role: 'editor',
					expiresIn: '2 days'
				})
			});

			const response = await fetch(`${API_BASE_URL}/api/token`, {
				headers: { Cookie: authCookie }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			// API returns data as array directly, with pagination info
			expect(Array.isArray(result.data)).toBe(true);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('should reject listing tokens without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token`);
			// Returns 401 or 403 depending on auth state
			expect(response.status).toBeGreaterThanOrEqual(401);
			expect(response.status).toBeLessThanOrEqual(403);
		});

		it('should return token list with pagination', async () => {
			// Test pagination structure
			const response = await fetch(`${API_BASE_URL}/api/token`, {
				headers: { Cookie: authCookie }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(Array.isArray(result.data)).toBe(true);
			expect(result.pagination).toBeDefined();
			expect(result.pagination.page).toBeDefined();
			expect(result.pagination.limit).toBeDefined();
		});
	});

	describe('GET /api/getTokensProvided', () => {
		it('should get tokens provided info with admin authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getTokensProvided`, {
				headers: { Cookie: authCookie }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			// API returns { google: boolean, twitch: boolean, tiktok: boolean }
			expect(typeof result.google).toBe('boolean');
			expect(typeof result.twitch).toBe('boolean');
			expect(typeof result.tiktok).toBe('boolean');
		});

		it('should reject the request without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getTokensProvided`);
			// Returns 401 or 403 depending on auth state
			expect(response.status).toBeGreaterThanOrEqual(401);
			expect(response.status).toBeLessThanOrEqual(403);
		});
	});
});
