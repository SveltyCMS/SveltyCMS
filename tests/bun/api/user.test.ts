import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment, testFixtures } from '../helpers/testSetup';

/**
 * @file tests/bun/api/user.test.ts
 * @description Integration tests for user-related API endpoints
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

describe('User API Endpoints', () => {
	beforeAll(async () => {
		await initializeTestEnvironment();
	});

	afterAll(async () => {
		await cleanupTestEnvironment();
	});

	beforeEach(async () => {
		await cleanupTestDatabase();
	});

	describe('POST /api/user/createUser', () => {
		it('should create first user without token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: testFixtures.users.firstAdmin.email,
					username: testFixtures.users.firstAdmin.username,
					password: testFixtures.users.firstAdmin.password,
					confirm_password: testFixtures.users.firstAdmin.password,
					firstName: testFixtures.users.firstAdmin.firstName,
					lastName: testFixtures.users.firstAdmin.lastName
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
		});

		it('should reject invalid email format', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: 'invalid-email',
					username: 'testuser',
					password: 'Test123!',
					confirm_password: 'Test123!'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject mismatched passwords', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: 'test@example.com',
					username: 'testuser',
					password: 'Test123!',
					confirm_password: 'Different123!'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject duplicate email', async () => {
			// Create first user
			await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: 'test@example.com',
					username: 'testuser1',
					password: 'Test123!',
					confirm_password: 'Test123!'
				})
			});

			// Try to create second user with same email
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: 'test@example.com',
					username: 'testuser2',
					password: 'Test123!',
					confirm_password: 'Test123!'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/user/login', () => {
		beforeEach(async () => {
			// Create a user to login with
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
		});

		it('should login with valid credentials', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: testFixtures.users.firstAdmin.email,
					password: testFixtures.users.firstAdmin.password
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
		});

		it('should reject invalid credentials', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: testFixtures.users.firstAdmin.email,
					password: 'wrongpassword'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject non-existent user', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: 'nonexistent@example.com',
					password: 'Test123!'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject invalid email format', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: 'invalid-email',
					password: 'Test123!'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/user/updateUserAttributes', () => {
		let authToken: string;

		beforeEach(async () => {
			// Create and login user
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

		it('should update user attributes with valid token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					firstName: 'Updated',
					lastName: 'Name'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject request without token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					firstName: 'Updated',
					lastName: 'Name'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject request with invalid token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer invalid-token'
				},
				body: JSON.stringify({
					firstName: 'Updated',
					lastName: 'Name'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/user/batch', () => {
		let authToken: string;

		beforeEach(async () => {
			// Create admin user
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

		it('should handle batch user operations', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${authToken}`
				},
				body: JSON.stringify({
					operation: 'list',
					limit: 10
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject batch operations without authorization', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					operation: 'list',
					limit: 10
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});
	});
});
