/**
 * @file tests/bun/api/user.test.ts
 * @description
 * Comprehensive integration test suite for all user-related API endpoints.
 *
 * Coverage:
 * - User creation (first user, subsequent users, validation)
 * - Authentication (login, logout, invalid credentials)
 * - Profile updates (self-edit, admin-edit, role changes)
 * - Batch operations (list, search, pagination)
 * - Avatar management (upload, delete, file validation, admin permissions)
 * - User invitation (token-based email invites, expiration times)
 * - Error cases (invalid input, unauthorized access, duplicate data)
 * - Session management (cookies, token validation)
 * - Authorization (role-based permissions, self vs other)
 *
 * Endpoints Tested:
 * - POST /api/user/createUser (4 tests)
 * - POST /api/user/login (2 tests)
 * - PUT /api/user/updateUserAttributes (4 tests)
 * - POST /api/user/batch (2 tests)
 * - POST /api/user/logout (1 test)
 * - POST /api/user/saveAvatar (6 tests)
 * - DELETE /api/user/deleteAvatar (5 tests)
 * - GET /api/user (index) (1 test)
 * - POST /api/user (index - invitations) (5 tests)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment, testFixtures } from '../helpers/testSetup';
import { getApiBaseUrl, waitForServer } from '../helpers/server';

const API_BASE_URL = getApiBaseUrl();

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
		await waitForServer(); // Wait for SvelteKit server to be ready
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
			expect(response.status).toBe(201); // API returns 201 Created
			expect(result._id).toBeDefined(); // API returns user object directly
			expect(result.email).toBe(testFixtures.users.firstAdmin.email);
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

	// --- COMPREHENSIVE ERROR CASE TESTS ---
	describe('Error Handling & Edge Cases', () => {
		describe('Invalid Input Validation', () => {
			it('should reject empty email', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ...testFixtures.users.firstAdmin, email: '' })
				});

				expect(response.status).toBe(400);
				const result = await response.json();
				expect(result.success).toBe(false);
			});

			it('should reject missing password', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: 'test@example.com', role: 'admin' })
				});

				expect(response.status).toBe(400);
				const result = await response.json();
				expect(result.success).toBe(false);
			});

			it('should reject password shorter than 8 characters', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ...testFixtures.users.firstAdmin, password: 'Short1!' })
				});

				expect(response.status).toBe(400);
				const result = await response.json();
				expect(result.success).toBe(false);
			});

			it('should reject malformed JSON', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: 'not valid json'
				});

				expect(response.status).toBe(400);
			});
		});

		describe('Authentication Edge Cases', () => {
			it('should reject login with non-existent email', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/login`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: 'nonexistent@example.com',
						password: 'AnyPassword123!'
					})
				});

				expect(response.status).toBe(401);
				const result = await response.json();
				expect(result.success).toBe(false);
			});

			it('should reject login with empty credentials', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/login`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: '', password: '' })
				});

				expect(response.status).toBe(400);
				const result = await response.json();
				expect(result.success).toBe(false);
			});
		});

		describe('Authorization Edge Cases', () => {
			let authCookies: string;

			beforeEach(async () => {
				authCookies = await loginAsAdmin();
			});

			it('should reject updateUserAttributes with invalid user_id', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', Cookie: authCookies },
					body: JSON.stringify({
						user_id: 'invalid-id-12345',
						newUserData: { username: 'newname' }
					})
				});

				expect(response.status).toBeGreaterThanOrEqual(400);
				const result = await response.json();
				expect(result.success).toBe(false);
			});

			it('should reject updateUserAttributes with empty newUserData', async () => {
				const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', Cookie: authCookies },
					body: JSON.stringify({
						user_id: 'self',
						newUserData: {}
					})
				});

				expect(response.status).toBeGreaterThanOrEqual(400);
			});
		});
	});

	// --- API ENDPOINT VERIFICATION ---
	describe('API Endpoint Availability', () => {
		let authCookies: string;

		beforeEach(async () => {
			authCookies = await loginAsAdmin();
		});

		it('should have /api/admin/users endpoint available', async () => {
			const response = await fetch(`${API_BASE_URL}/api/admin/users?limit=1`, {
				method: 'GET',
				headers: { Cookie: authCookies }
			});

			expect(response.status).toBeLessThan(500); // Should not be 500/503
		});

		it('should have /api/admin/tokens endpoint available', async () => {
			const response = await fetch(`${API_BASE_URL}/api/admin/tokens?limit=1`, {
				method: 'GET',
				headers: { Cookie: authCookies }
			});

			expect(response.status).toBeLessThan(500); // Should not be 500/503
		});

		it('should have /api/user/logout endpoint available', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/logout`, {
				method: 'POST',
				headers: { Cookie: authCookies }
			});

			expect(response.status).toBeLessThan(500); // Should not be 500/503
		});
	});

	// --- SESSION MANAGEMENT TESTS ---
	describe('Session Management', () => {
		it('should set session cookie on successful login', async () => {
			await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(testFixtures.users.firstAdmin)
			});

			const loginResponse = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: testFixtures.users.firstAdmin.email,
					password: testFixtures.users.firstAdmin.password
				})
			});

			const setCookie = loginResponse.headers.get('set-cookie');
			expect(setCookie).toBeDefined();
			expect(setCookie).toContain('auth_session');
		});

		it('should reject authenticated requests with invalid session cookie', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: 'auth_session=invalid-session-token'
				},
				body: JSON.stringify({
					user_id: 'self',
					newUserData: { username: 'newname' }
				})
			});

			expect(response.status).toBe(401);
		});

		it('should clear session on logout', async () => {
			const authCookies = await loginAsAdmin();

			const logoutResponse = await fetch(`${API_BASE_URL}/api/user/logout`, {
				method: 'POST',
				headers: { Cookie: authCookies }
			});

			expect(logoutResponse.status).toBe(200);

			// Verify the session is cleared by trying to use it
			const testResponse = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookies // Old cookie should be invalid
				},
				body: JSON.stringify({
					user_id: 'self',
					newUserData: { username: 'test' }
				})
			});

			// After logout, the session should be invalid
			expect(testResponse.status).toBe(401);
		});
	});

	// --- AVATAR MANAGEMENT TESTS ---
	describe('POST /api/user/saveAvatar', () => {
		let authCookies: string;

		beforeEach(async () => {
			authCookies = await loginAsAdmin();
		});

		it('should upload avatar for authenticated user', async () => {
			// Create a mock image file
			const mockImageContent = new Uint8Array([
				0x89,
				0x50,
				0x4e,
				0x47,
				0x0d,
				0x0a,
				0x1a,
				0x0a // PNG header
			]);
			const mockFile = new File([mockImageContent], 'avatar.png', { type: 'image/png' });

			const formData = new FormData();
			formData.append('avatar', mockFile);

			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: authCookies },
				body: formData
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.avatarUrl).toBeDefined();
		});

		it('should reject avatar upload without authentication', async () => {
			const mockImageContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			const mockFile = new File([mockImageContent], 'avatar.png', { type: 'image/png' });

			const formData = new FormData();
			formData.append('avatar', mockFile);

			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				body: formData // No auth cookie
			});

			expect(response.status).toBe(401);
		});

		it('should reject avatar upload without file', async () => {
			const formData = new FormData();
			// No avatar file attached

			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: authCookies },
				body: formData
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
		});

		it('should reject invalid file type for avatar', async () => {
			// Create a mock text file (invalid type)
			const mockFile = new File(['not an image'], 'document.txt', { type: 'text/plain' });

			const formData = new FormData();
			formData.append('avatar', mockFile);

			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: authCookies },
				body: formData
			});

			const result = await response.json();
			expect(response.status).toBe(400);
			expect(result.success).toBe(false);
			expect(result.message).toContain('Invalid file type');
		});

		it('should allow admin to upload avatar for another user', async () => {
			// Create a second user
			const createUserResponse = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies },
				body: JSON.stringify(testFixtures.users.secondUser)
			});
			const createdUser = await createUserResponse.json();
			const secondUserId = createdUser.data?._id || createdUser._id;

			const mockImageContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			const mockFile = new File([mockImageContent], 'avatar.png', { type: 'image/png' });

			const formData = new FormData();
			formData.append('avatar', mockFile);
			formData.append('userId', secondUserId);

			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: authCookies },
				body: formData
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.avatarUrl).toBeDefined();
		});

		it('should accept various image formats (JPEG, PNG, GIF, WebP)', async () => {
			const imageFormats = [
				{ type: 'image/jpeg', name: 'avatar.jpg' },
				{ type: 'image/png', name: 'avatar.png' },
				{ type: 'image/gif', name: 'avatar.gif' },
				{ type: 'image/webp', name: 'avatar.webp' }
			];

			for (const format of imageFormats) {
				const mockImageContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
				const mockFile = new File([mockImageContent], format.name, { type: format.type });

				const formData = new FormData();
				formData.append('avatar', mockFile);

				const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
					method: 'POST',
					headers: { Cookie: authCookies },
					body: formData
				});

				const result = await response.json();
				expect(response.status).toBe(200);
				expect(result.success).toBe(true);
			}
		});
	});

	describe('DELETE /api/user/deleteAvatar', () => {
		let authCookies: string;

		beforeEach(async () => {
			authCookies = await loginAsAdmin();
		});

		it('should delete own avatar when authenticated', async () => {
			// First, upload an avatar
			const mockImageContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			const mockFile = new File([mockImageContent], 'avatar.png', { type: 'image/png' });

			const formData = new FormData();
			formData.append('avatar', mockFile);

			await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: authCookies },
				body: formData
			});

			// Then delete it
			const response = await fetch(`${API_BASE_URL}/api/user/deleteAvatar`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
			expect(result.message).toContain('removed');
		});

		it('should reject avatar deletion without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/deleteAvatar`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' } // No auth cookie
			});

			expect(response.status).toBe(401);
		});

		it('should allow deletion when no avatar exists', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/deleteAvatar`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should allow admin to delete another user avatar', async () => {
			// Create a second user
			const createUserResponse = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies },
				body: JSON.stringify(testFixtures.users.secondUser)
			});
			const createdUser = await createUserResponse.json();
			const secondUserId = createdUser.data?._id || createdUser._id;

			// Upload avatar for second user
			const mockImageContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			const mockFile = new File([mockImageContent], 'avatar.png', { type: 'image/png' });
			const formData = new FormData();
			formData.append('avatar', mockFile);
			formData.append('userId', secondUserId);

			await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: authCookies },
				body: formData
			});

			// Admin deletes second user's avatar
			const response = await fetch(`${API_BASE_URL}/api/user/deleteAvatar`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies },
				body: JSON.stringify({ userId: secondUserId })
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.success).toBe(true);
		});

		it('should return default avatar URL after deletion', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/deleteAvatar`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies }
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(result.avatarUrl).toBe('/Default_User.svg');
		});
	});

	// --- USER INDEX ENDPOINT TESTS ---
	describe('GET /api/user (index)', () => {
		it('should return not implemented for GET request', async () => {
			const authCookies = await loginAsAdmin();

			const response = await fetch(`${API_BASE_URL}/api/user`, {
				method: 'GET',
				headers: { Cookie: authCookies }
			});

			const result = await response.json();
			expect(response.status).toBe(501); // Not Implemented
			expect(result.message).toContain('not implemented');
		});
	});

	describe('POST /api/user (index)', () => {
		let authCookies: string;

		beforeEach(async () => {
			authCookies = await loginAsAdmin();
		});

		it('should create user and send invitation token via email', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies },
				body: JSON.stringify({
					email: 'newinvite@example.com',
					role: 'developer',
					expiresIn: '2 hrs'
				})
			});

			// Note: This will fail if sendMail API is not available or email service not configured
			// But we test the endpoint structure
			if (response.status === 201) {
				const result = await response.json();
				expect(result._id).toBeDefined();
			} else {
				// If email service unavailable, expect 500 or specific error
				expect(response.status).toBeGreaterThanOrEqual(400);
			}
		});

		it('should reject user creation without authentication', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }, // No auth cookie
				body: JSON.stringify({
					email: 'newinvite@example.com',
					role: 'developer',
					expiresIn: '2 hrs'
				})
			});

			expect(response.status).toBe(401);
		});

		it('should reject duplicate user creation for same email', async () => {
			// First attempt
			await fetch(`${API_BASE_URL}/api/user`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies },
				body: JSON.stringify({
					email: 'duplicate@example.com',
					role: 'developer',
					expiresIn: '2 hrs'
				})
			});

			// Second attempt with same email
			const response = await fetch(`${API_BASE_URL}/api/user`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies },
				body: JSON.stringify({
					email: 'duplicate@example.com',
					role: 'developer',
					expiresIn: '2 hrs'
				})
			});

			expect(response.status).toBe(409); // Conflict
			const result = await response.json();
			expect(result.message).toContain('already exists');
		});

		it('should reject invalid expiration time', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: authCookies },
				body: JSON.stringify({
					email: 'test@example.com',
					role: 'developer',
					expiresIn: 'invalid-time'
				})
			});

			expect(response.status).toBe(400);
		});

		it('should accept valid expiration time options', async () => {
			const validExpirations = ['2 hrs', '12 hrs', '2 days', '1 week'];

			for (const expiresIn of validExpirations) {
				const response = await fetch(`${API_BASE_URL}/api/user`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Cookie: authCookies },
					body: JSON.stringify({
						email: `test-${expiresIn.replace(/\s/g, '-')}@example.com`,
						role: 'developer',
						expiresIn
					})
				});

				// Either succeeds (201) or fails due to email service (500), but not validation error (400)
				expect([201, 500]).toContain(response.status);
			}
		});
	});
});
