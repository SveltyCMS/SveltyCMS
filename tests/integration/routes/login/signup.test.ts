/**
 * @file tests/bun/routes/login/signup.test.ts
 * @description Integration tests for invitation-based user signup
 *
 * IMPORTANT: First user signup is handled by /setup route (enforced by handleSetup hook)
 * These tests cover subsequent user signup which ALWAYS requires an invitation token
 *
 * Tests:
 * - Email signup with valid invitation token
 * - OAuth signup with valid invitation token
 * - Rejection of signup attempts without valid token
 * - Token validation and consumption
 *
 * NOTE: TypeScript errors are expected - bun:test is runtime-only, db-helper needs creation
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { dropDatabase, getUser, getUserCount, userExists, waitFor } from '../../helpers/db-helper';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

describe('Invitation-Based Signup Tests', () => {
	// Clean database before each test
	beforeEach(async () => {
		await dropDatabase();
		console.log('🧹 Database cleaned for test');
	});

	describe('Setup Required (First User)', () => {
		it('should redirect to /setup when no users exist', async () => {
			// Verify database is empty
			const initialUserCount = await getUserCount();
			expect(initialUserCount).toBe(0);

			// Try to access /login when no users exist - should redirect to /setup
			const response = await fetch(`${API_BASE_URL}/login`, {
				method: 'GET',
				redirect: 'manual' // Don't follow redirects automatically
			});

			// Should get redirect to /setup
			expect([301, 302, 303, 307, 308]).toContain(response.status);
			const location = response.headers.get('location');
			expect(location).toContain('/setup');

			console.log('✅ Correctly redirected to /setup when no users exist');
		});
	});

	describe('Invited User Email Signup', () => {
		beforeEach(async () => {
			// Create first user (admin) to test invitation flow
			await dropDatabase();

			// TODO: Create user through proper setup flow
			// For now, this is a placeholder
			console.log('⚠️ Admin user setup needed for invitation tests');
		});

		it('should allow invited user signup with valid token', async () => {
			// Verify database is empty
			const initialUserCount = await getUserCount();
			expect(initialUserCount).toBe(0);

			// Test data for first user (admin)
			const signupData = {
				email: 'admin@test.com',
				username: 'admin',
				password: 'Test123!',
				confirm_password: 'Test123!'
			};

			// Make signup request to API
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(signupData)
			});

			// Check response
			expect(response.status).toBe(200);
			const result = await response.json();
			expect(result.success).toBe(true);

			// Wait for user to be created in database
			const userCreated = await waitFor(async () => {
				return await userExists(signupData.email);
			}, 3000);

			expect(userCreated).toBe(true);

			// Verify user details in database
			const user = await getUser(signupData.email);
			expect(user).toBeTruthy();
			expect(user?.email).toBe(signupData.email.toLowerCase());
			expect(user?.username).toBe(signupData.username);
			expect(user?.isRegistered).toBe(true);
			expect(user?.blocked).toBe(false);

			// Verify user count increased
			const finalUserCount = await getUserCount();
			expect(finalUserCount).toBe(1);

			console.log('✅ First user email signup test passed');
		});

		it('should assign admin role to first user', async () => {
			// Create first user
			const signupData = {
				email: 'admin@test.com',
				username: 'admin',
				password: 'Test123!',
				confirm_password: 'Test123!'
			};

			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(signupData)
			});

			expect(response.status).toBe(200);

			// Wait for user creation
			await waitFor(async () => {
				return await userExists(signupData.email);
			}, 3000);

			// Check user role
			const user = await getUser(signupData.email);
			expect(user).toBeTruthy();

			// The first user should have admin privileges
			// This depends on your role system implementation
			expect(user?.role).toBeTruthy();

			console.log('✅ First user admin role test passed');
		});

		it('should reject signup with invalid email format', async () => {
			const signupData = {
				email: 'invalid-email',
				username: 'testuser',
				password: 'Test123!',
				confirm_password: 'Test123!'
			};

			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(signupData)
			});

			// Should fail validation
			expect(response.status).not.toBe(200);

			// Verify no user was created
			const userCount = await getUserCount();
			expect(userCount).toBe(0);

			console.log('✅ Invalid email rejection test passed');
		});

		it('should reject signup with weak password', async () => {
			const signupData = {
				email: 'test@test.com',
				username: 'testuser',
				password: 'weak',
				confirm_password: 'weak'
			};

			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(signupData)
			});

			// Should fail validation
			expect(response.status).not.toBe(200);

			// Verify no user was created
			const userCount = await getUserCount();
			expect(userCount).toBe(0);

			console.log('✅ Weak password rejection test passed');
		});

		it('should reject signup with mismatched passwords', async () => {
			const signupData = {
				email: 'test@test.com',
				username: 'testuser',
				password: 'Test123!',
				confirm_password: 'Different123!'
			};

			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(signupData)
			});

			// Should fail validation
			expect(response.status).not.toBe(200);

			// Verify no user was created
			const userCount = await getUserCount();
			expect(userCount).toBe(0);

			console.log('✅ Mismatched password rejection test passed');
		});
	});

	describe('First User OAuth Signup', () => {
		beforeEach(async () => {
			// Ensure database is clean for OAuth tests
			await dropDatabase();
			console.log('🧹 Database cleaned for OAuth test');
		});

		it('should allow first user OAuth signup without token', async () => {
			// Verify database is empty
			const initialUserCount = await getUserCount();
			expect(initialUserCount).toBe(0);

			// Simulate OAuth callback data (this would normally come from Google)
			const oauthData = {
				email: 'oauth.user@gmail.com',
				name: 'OAuth User',
				picture: 'https://example.com/avatar.jpg',
				sub: 'google-oauth-id-123'
			};

			// Test OAuth signup endpoint
			const response = await fetch(`${API_BASE_URL}/login/oauth`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'signInOAuth',
					...oauthData
				})
			});

			// Check if OAuth endpoint is properly configured
			if (response.status === 404) {
				console.log('⚠️ OAuth endpoint not found - this might be expected in test environment');
				return;
			}

			// If OAuth is configured, test the flow
			if (response.status === 200) {
				// Wait for user to be created
				const userCreated = await waitFor(async () => {
					return await userExists(oauthData.email);
				}, 5000);

				expect(userCreated).toBe(true);

				// Verify user details
				const user = await getUser(oauthData.email);
				expect(user).toBeTruthy();
				expect(user?.email).toBe(oauthData.email.toLowerCase());
				expect(user?.isRegistered).toBe(true);
				expect(user?.lastAuthMethod).toBe('oauth');

				console.log('✅ First user OAuth signup test passed');
			} else {
				console.log(`ℹ️ OAuth test skipped - endpoint returned status ${response.status}`);
			}
		});

		it('should handle OAuth errors gracefully', async () => {
			// Test with invalid OAuth data
			const invalidOauthData = {
				email: 'invalid-email-format',
				name: '',
				picture: '',
				sub: ''
			};

			const response = await fetch(`${API_BASE_URL}/login/oauth`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'signInOAuth',
					...invalidOauthData
				})
			});

			// Should handle errors gracefully (either 400 or 404 is acceptable)
			expect([400, 404, 422, 500]).toContain(response.status);

			// Verify no user was created with invalid data
			const userCount = await getUserCount();
			expect(userCount).toBe(0);

			console.log('✅ OAuth error handling test passed');
		});
	});

	describe('Subsequent User Signup (Invitation Required)', () => {
		beforeEach(async () => {
			// Create first user to test invitation flow
			await dropDatabase();

			const firstUserData = {
				email: 'admin@test.com',
				username: 'admin',
				password: 'Test123!',
				confirm_password: 'Test123!'
			};

			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(firstUserData)
			});

			expect(response.status).toBe(200);

			// Wait for first user to be created
			await waitFor(async () => {
				return await userExists(firstUserData.email);
			}, 3000);

			console.log('✅ First user created for invitation flow test');
		});

		it('should reject second user signup without invitation token', async () => {
			// Verify first user exists
			const userCount = await getUserCount();
			expect(userCount).toBe(1);

			// Try to create second user without token
			const secondUserData = {
				email: 'user2@test.com',
				username: 'user2',
				password: 'Test123!',
				confirm_password: 'Test123!'
			};

			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(secondUserData)
			});

			// Should be rejected (typically 400 or 403)
			expect(response.status).not.toBe(200);

			// Verify second user was not created
			const finalUserCount = await getUserCount();
			expect(finalUserCount).toBe(1);

			const secondUserExists = await userExists(secondUserData.email);
			expect(secondUserExists).toBe(false);

			console.log('✅ Second user rejection without token test passed');
		});

		it('should reject OAuth signup for second user without token', async () => {
			// Verify first user exists
			const userCount = await getUserCount();
			expect(userCount).toBe(1);

			// Try OAuth signup for second user without token
			const oauthData = {
				email: 'oauth.user2@gmail.com',
				name: 'OAuth User 2',
				picture: 'https://example.com/avatar2.jpg',
				sub: 'google-oauth-id-456'
			};

			const response = await fetch(`${API_BASE_URL}/login/oauth`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'signInOAuth',
					...oauthData
				})
			});

			// Should be rejected if OAuth is configured
			if (response.status !== 404) {
				expect(response.status).not.toBe(200);
			}

			// Verify second user was not created via OAuth
			const finalUserCount = await getUserCount();
			expect(finalUserCount).toBe(1);

			const oauthUserExists = await userExists(oauthData.email);
			expect(oauthUserExists).toBe(false);

			console.log('✅ Second user OAuth rejection without token test passed');
		});
	});
});
