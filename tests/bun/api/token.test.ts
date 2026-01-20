/**
 * @file tests/bun/api/token.test.ts
 * @description
 * Integration test suite for all token-related API endpoints.
 * This suite covers the creation, validation, deletion, and listing of invitation tokens,
 * ensuring that all operations are correctly protected by admin authentication.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { prepareAuthenticatedContext, cleanupTestDatabase, testFixtures } from '../helpers/testSetup';
import { getApiBaseUrl, waitForServer } from '../helpers/server';

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
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					email: testFixtures.users.editor.email,
					role: 'user',
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
				body: JSON.stringify({ email: testFixtures.users.editor.email, role: 'user', expiresIn: '2 days' })
			});

			expect(response.status).toBe(401);
		});

		it('should reject token creation for an invalid email format', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({ email: 'invalid-email', role: 'user' })
			});

			expect(response.status).toBe(400);
		});
	});

	describe('Token Validation and Deletion', () => {
		let invitationToken: string;

		// Before each test in this block, create a fresh invitation token
		beforeEach(async () => {
			const createResponse = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({ email: testFixtures.users.editor.email, role: 'user', expiresIn: '2 days' })
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
			await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookie },
				body: JSON.stringify({ email: 'user1@test.com', role: 'user' })
			});

			const response = await fetch(`${API_BASE_URL}/api/token`, {
				headers: { Cookie: authCookie }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(Array.isArray(result.data.tokens)).toBe(true);
			expect(result.data.tokens.length).toBeGreaterThan(0);
		});

		it('should reject listing tokens without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token`);
			expect(response.status).toBe(401);
		});

		it('should handle an empty token list correctly', async () => {
			// No tokens are created in this test, so the list should be empty
			const response = await fetch(`${API_BASE_URL}/api/token`, {
				headers: { Cookie: authCookie }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(Array.isArray(result.data.tokens)).toBe(true);
			expect(result.data.tokens.length).toBe(0);
		});
	});

	describe('GET /api/getTokensProvided', () => {
		it('should get tokens provided info with admin authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getTokensProvided`, {
				headers: { Cookie: authCookie }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject the request without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getTokensProvided`);
			expect(response.status).toBe(401);
		});
	});
});
