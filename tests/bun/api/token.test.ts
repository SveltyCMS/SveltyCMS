import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment, testFixtures } from '../helpers/testSetup';

/**
 * @file tests/bun/api/token.test.ts
 * @description Integration tests for token-related API endpoints
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

describe('Token API Endpoints', () => {
	let authToken: string;

	beforeAll(async () => {
		await initializeTestEnvironment();
	});

	afterAll(async () => {
		await cleanupTestEnvironment();
	});

	beforeEach(async () => {
		await cleanupTestDatabase();

		// Create admin user and get auth token
		await fetch(`${API_BASE_URL}/api/user/createUser`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: testFixtures.users.firstAdmin.email,
				username: testFixtures.users.firstAdmin.username,
				password: testFixtures.users.firstAdmin.password,
				confirm_password: testFixtures.users.firstAdmin.password
			})
		});

		const loginResponse = await fetch(`${API_BASE_URL}/api/user/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: testFixtures.users.firstAdmin.email,
				password: testFixtures.users.firstAdmin.password
			})
		});

		const loginResult = await loginResponse.json();
		authToken = loginResult.data.token;
	});

	describe('POST /api/token/createToken', () => {
		it('should create invitation token with valid admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					email: testFixtures.users.invitedUser.email,
					role: 'user',
					expiresIn: '7d'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data.token).toBeDefined();
		});

		it('should reject token creation without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: testFixtures.users.invitedUser.email,
					role: 'user'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject invalid email format', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					email: 'invalid-email',
					role: 'user'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject missing required fields', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					email: testFixtures.users.invitedUser.email
					// Missing role
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('GET /api/token/[tokenID]', () => {
		let invitationToken: string;

		beforeEach(async () => {
			// Create a token first
			const createResponse = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					email: testFixtures.users.invitedUser.email,
					role: 'user'
				})
			});

			const createResult = await createResponse.json();
			invitationToken = createResult.data.token;
		});

		it('should validate existing token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data.valid).toBe(true);
		});

		it('should reject invalid token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/invalid-token-id`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject non-existent token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/non-existent-token`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(response.status).toBe(404);
			expect(result.success).toBe(false);
		});
	});

	describe('DELETE /api/token/[tokenID]', () => {
		let invitationToken: string;

		beforeEach(async () => {
			// Create a token first
			const createResponse = await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					email: testFixtures.users.invitedUser.email,
					role: 'user'
				})
			});

			const createResult = await createResponse.json();
			invitationToken = createResult.data.token;
		});

		it('should delete token with admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);

			// Verify token is deleted
			const checkResponse = await fetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const checkResult = await checkResponse.json();
			expect(checkResponse.status).toBe(404);
			expect(checkResult.success).toBe(false);
		});

		it('should reject deletion without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/${invitationToken}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject deletion of non-existent token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token/non-existent-token`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(404);
			expect(result.success).toBe(false);
		});
	});

	describe('GET /api/token', () => {
		it('should list tokens with admin auth', async () => {
			// Create a few tokens first
			await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					email: 'user1@test.com',
					role: 'user'
				})
			});

			await fetch(`${API_BASE_URL}/api/token/createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					email: 'user2@test.com',
					role: 'user'
				})
			});

			const response = await fetch(`${API_BASE_URL}/api/token`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data.tokens).toBeDefined();
			expect(Array.isArray(result.data.tokens)).toBe(true);
		});

		it('should reject listing without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should handle empty token list', async () => {
			const response = await fetch(`${API_BASE_URL}/api/token`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data.tokens).toBeDefined();
			expect(Array.isArray(result.data.tokens)).toBe(true);
		});
	});

	describe('GET /api/getTokensProvided', () => {
		it('should get tokens provided info with admin auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getTokensProvided`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				}
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject request without auth', async () => {
			const response = await fetch(`${API_BASE_URL}/api/getTokensProvided`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});
	});
});
