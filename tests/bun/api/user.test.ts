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

	describe('PUT /api/user/updateUserAttributes', () => {
		let authCookies: string;

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

			// Extract cookies from the login response
			const setCookieHeader = loginResponse.headers.get('set-cookie');
			authCookies = setCookieHeader || '';
		});

		it('should update user attributes with valid token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookies
				},
				body: JSON.stringify({
					user_id: 'self', // Special identifier for self-update
					newUserData: {
						firstName: 'Updated',
						lastName: 'Name'
					}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should reject request without token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					user_id: 'some-user-id',
					newUserData: {
						firstName: 'Updated',
						lastName: 'Name'
					}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});

		it('should reject request with invalid token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: 'invalid-cookie'
				},
				body: JSON.stringify({
					user_id: 'some-user-id',
					newUserData: {
						firstName: 'Updated',
						lastName: 'Name'
					}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(401);
			expect(result.success).toBe(false);
		});
		it('should allow admin to update another user role', async () => {
			// Create a second user to update
			const createUserResponse = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: 'seconduser@example.com',
					username: 'seconduser',
					password: 'Test123!',
					confirm_password: 'Test123!'
				})
			});

			const createdUser = await createUserResponse.json();
			const secondUserId = createdUser.data._id;

			// Update the second user's role as admin
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookies
				},
				body: JSON.stringify({
					user_id: secondUserId,
					newUserData: {
						role: 'developer' // Valid role ID from config/roles.ts
					}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should prevent user from changing their own role', async () => {
			// Get the current admin user's ID
			const currentUserResponse = await fetch(`${API_BASE_URL}/api/user/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookies
				},
				body: JSON.stringify({
					operation: 'list',
					limit: 1,
					filter: { email: testFixtures.users.firstAdmin.email }
				})
			});

			const currentUserResult = await currentUserResponse.json();
			const currentUserId = currentUserResult.data[0]._id;

			// Try to change own role (should fail)
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookies
				},
				body: JSON.stringify({
					user_id: currentUserId, // Using the actual admin's ID
					newUserData: {
						role: 'developer'
					}
				})
			});

			const result = await response.json();
			expect(response.status).toBe(403);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/user/batch', () => {
		let authCookies: string;

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

			// Extract cookies from the login response
			const setCookieHeader = loginResponse.headers.get('set-cookie');
			authCookies = setCookieHeader || '';
		});

		it('should handle batch user operations', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookies
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
