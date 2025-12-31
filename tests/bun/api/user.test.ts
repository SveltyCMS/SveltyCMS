/**
 * @file tests/bun/api/user.test.ts
 * @description Integration tests for User API.
 * Uses shared helpers for authentication and environment setup.
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { testFixtures, initializeTestEnvironment, prepareAuthenticatedContext } from '../helpers/testSetup';
import { getApiBaseUrl } from '../helpers/server';

const API_BASE_URL = getApiBaseUrl();

describe('User API Integration', () => {
	let adminCookie: string;

	// 1. ONE-TIME SETUP
	beforeAll(async () => {
		// Wait for server
		await initializeTestEnvironment();

		// Ensure standard users (admin/editor) exist and get session
		// This helper handles DB cleanup, user creation, and login
		adminCookie = await prepareAuthenticatedContext();

		// Get Admin ID (optional check, can be used for reference)
		await fetch(`${API_BASE_URL}/api/user/batch`, {
			method: 'POST',
			headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
			body: JSON.stringify({ operation: 'list', limit: 1 })
		});
	});

	// --- TEST SUITE 1: USER CREATION ---
	describe('POST /api/user/createUser', () => {
		it('should create a new user successfully', async () => {
			// Use unique email to avoid DB conflicts
			const uniqueEmail = `newuser_${Date.now()}@test.com`;

			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: adminCookie // Requires admin to create users
				},
				body: JSON.stringify({
					...testFixtures.users.admin,
					email: uniqueEmail,
					role: 'editor'
				})
			});

			const result = await response.json();
			expect(response.status).toBe(201);
			expect(result.email).toBe(uniqueEmail);
		});

		it('should reject invalid email format', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
				body: JSON.stringify({
					...testFixtures.users.admin,
					email: 'invalid-email-format'
				})
			});
			expect(response.status).toBe(400);
		});

		it('should reject mismatched passwords', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
				body: JSON.stringify({
					...testFixtures.users.admin,
					email: `mismatch_${Date.now()}@test.com`,
					confirmPassword: 'WrongPassword123!'
				})
			});
			expect(response.status).toBe(400);
		});
	});

	// --- TEST SUITE 2: AUTHENTICATION ---
	describe('POST /api/user/login', () => {
		it('should login with valid credentials (JSON)', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: testFixtures.users.admin.email,
					password: testFixtures.users.admin.password
				})
			});

			expect(response.status).toBe(200);
			expect(response.headers.get('set-cookie')).toBeDefined();
		});

		it('should reject invalid credentials', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: testFixtures.users.admin.email,
					password: 'WrongPassword123!'
				})
			});
			expect(response.status).toBe(400);
		});
	});

	// --- TEST SUITE 3: ATTRIBUTE UPDATES ---
	describe('PUT /api/user/updateUserAttributes', () => {
		it('should allow user to update their own name', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
				body: JSON.stringify({
					user_id: 'self',
					newUserData: { username: 'UpdatedAdminName' }
				})
			});
			expect(response.status).toBe(200);

			// Verify
			const verify = await fetch(`${API_BASE_URL}/api/user`, {
				headers: { Cookie: adminCookie }
			});
			const data = await verify.json();
			expect(data.username).toBe('UpdatedAdminName');
		});

		it('should reject unauthorized token', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/updateUserAttributes`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' }, // No Cookie
				body: JSON.stringify({ user_id: 'self', newUserData: {} })
			});
			expect(response.status).toBe(401);
		});
	});

	// --- TEST SUITE 4: AVATAR MANAGEMENT ---
	describe('POST /api/user/saveAvatar', () => {
		it('should upload avatar using FormData', async () => {
			// 1x1 Pixel Transparent PNG
			const pngBytes = new Uint8Array([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
				0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01,
				0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
			]);
			const file = new File([pngBytes], 'avatar.png', { type: 'image/png' });

			const formData = new FormData();
			formData.append('avatar', file);

			const response = await fetch(`${API_BASE_URL}/api/user/saveAvatar`, {
				method: 'POST',
				headers: { Cookie: adminCookie },
				body: formData
			});

			expect(response.status).toBe(200);
			const result = await response.json();
			expect(result.avatarUrl).toBeDefined();
		});
	});

	// --- TEST SUITE 5: BATCH OPERATIONS ---
	describe('POST /api/user/batch', () => {
		it('should list users', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/batch`, {
				method: 'POST',
				headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
				body: JSON.stringify({ operation: 'list', limit: 5 })
			});

			const result = await response.json();
			expect(response.status).toBe(200);
			expect(Array.isArray(result.data)).toBe(true);
			expect(result.data.length).toBeGreaterThan(0);
		});
	});

	// --- TEST SUITE 6: LOGOUT ---
	describe('POST /api/user/logout', () => {
		it('should invalidate session', async () => {
			const response = await fetch(`${API_BASE_URL}/api/user/logout`, {
				method: 'POST',
				headers: { Cookie: adminCookie }
			});
			expect(response.status).toBe(200);

			// Verify old cookie is dead
			const check = await fetch(`${API_BASE_URL}/api/user`, {
				headers: { Cookie: adminCookie }
			});
			// Should be 401 Unauthorized or 403 Forbidden
			expect([401, 403]).toContain(check.status);
		});
	});
});
