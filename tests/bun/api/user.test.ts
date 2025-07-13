/**
 * @file tests/bun/api/user.test.ts
 * @description
 * Integration test suite for all user-related API endpoints.
 * This suite covers user creation, authentication, profile updates, and batch operations.
 * It ensures proper handling of both authenticated and unauthenticated requests,
 * validating input, permissions, and correct data responses.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment, testFixtures } from '../helpers/testSetup';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

/**
 * Helper function to log in as the default admin and return authentication cookies.
 * This avoids repeating login logic in multiple test blocks.
 * @returns {Promise<string>} The authentication cookie string.
 */
const loginAsAdmin = async (): Promise<string> => {
	// 1. Create the admin user
	await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			...testFixtures.users.firstAdmin
		})
	});

	// 2. Log in as the admin user
	const loginResponse = await fetch(`${API_BASE_URL}/api/user/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: testFixtures.users.firstAdmin.email,
			password: testFixtures.users.firstAdmin.password
		})
	});

	// 3. Fail fast if login is unsuccessful
	if (loginResponse.status !== 200) {
		throw new Error('Test setup failed: Could not log in as admin.');
	}

	// 4. Extract and return the session cookie
	const setCookieHeader = loginResponse.headers.get('set-cookie');
	if (!setCookieHeader) {
		throw new Error('Test setup failed: No cookie was returned upon login.');
	}

	return setCookieHeader;
};

describe('User API Endpoints', () => {
	// Initialize the test environment once for all tests in this file
	beforeAll(async () => {
		await initializeTestEnvironment();
	});

	// Clean up the entire environment after all tests have run
	afterAll(async () => {
		await cleanupTestEnvironment();
	});

	// Clean the database before each individual test to ensure isolation
	beforeEach(async () => {
		await cleanupTestDatabase();
	});

	describe('POST /api/user/createUser', () => {
		it('should create the first user successfully without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(testFixtures.users.firstAdmin)
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
		});

		it('should reject user creation with an invalid email format', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...testFixtures.users.firstAdmin, email: 'invalid-email' })
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject user creation with mismatched passwords', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...testFixtures.users.firstAdmin, confirm_password: 'DifferentPassword123!' })
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject user creation with a duplicate email', async () => {
			// Create the first user
			await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(testFixtures.users.firstAdmin)
			});

			// Attempt to create a second user with the same email
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...testFixtures.users.secondUser, email: testFixtures.users.firstAdmin.email })
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('POST /api/user/login', () => {
		beforeEach(async () => {
			// Ensure a user exists to log in with
			await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(testFixtures.users.firstAdmin)
			});
		});

		it('should log in successfully with valid credentials', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: testFixtures.users.firstAdmin.email,
					password: testFixtures.users.firstAdmin.password
				})
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(response.headers.get('set-cookie')).toBeDefined();
		});

		it('should reject login with invalid credentials', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: testFixtures.users.firstAdmin.email,
					password: 'wrongpassword'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});
	});

	describe('Authenticated User Actions', () => {
		let authCookies: string;
		let adminUserId: string;

		// Use the helper to log in before each authenticated test
		beforeEach(async () => {
			authCookies = await loginAsAdmin();
			// Fetch the created admin's ID for use in tests that need to target a specific user
			const batchResponse = await fetch(`${API_BASE_URL}/api/user/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies },
				body: JSON.stringify({ operation: 'list', limit: 1 })
			});
			const batchResult = await batchResponse.json();
			adminUserId = batchResult.data[0]._id;
		});

		describe('PUT /api/user/updateUserAttributes', () => {
			it('should allow a user to update their own attributes', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', Cookie: authCookies },
					body: JSON.stringify({
						user_id: 'self',
						newUserData: { firstName: 'UpdatedFirst', lastName: 'UpdatedLast' }
					})
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should allow an admin to update another user role', async () => {
				// Create a second user to be updated
				const createUserResponse = await fetch(`${API_BASE_URL}/api/user/createUser`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Cookie: authCookies },
					body: JSON.stringify(testFixtures.users.secondUser)
				});
				const createdUser = await createUserResponse.json();
				const secondUserId = createdUser.data._id;

				const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', Cookie: authCookies },
					body: JSON.stringify({
						user_id: secondUserId,
						newUserData: { role: 'developer' } // Assuming 'developer' is a valid role ID
					})
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			});

			it('should prevent any user, including an admin, from changing their own role', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', Cookie: authCookies },
					body: JSON.stringify({
						user_id: adminUserId, // Targeting self with actual ID
						newUserData: { role: 'developer' }
					})
				});

				const result = await response.json();
				expect(response.status).toBe(403); // Forbidden
				expect(result.success).toBe(false);
			});

			it('should reject request without a valid token', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' }, // No cookie
					body: JSON.stringify({ user_id: 'self', newUserData: { firstName: 'Updated' } })
				});

				const result = await response.json();
				expect(response.status).toBe(401); // Unauthorized
				expect(result.success).toBe(false);
			});
		});

		describe('POST /api/user/batch', () => {
			it('should allow an admin to perform batch user operations', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/batch`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Cookie: authCookies },
					body: JSON.stringify({ operation: 'list', limit: 10 })
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
				expect(Array.isArray(result.data)).toBe(true);
			});

			it('should reject batch operations without authorization', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/batch`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }, // No cookie
					body: JSON.stringify({ operation: 'list', limit: 10 })
				});

				const result = await response.json();
				expect(response.status).toBe(401);
				expect(result.success).toBe(false);
			});
		});
	});
});
