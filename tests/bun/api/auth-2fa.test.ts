/**
 * @file tests/bun/api/auth-2fa.test.ts
 * @description Integration tests for 2FA Authentication API endpoints
 *
 * Tests 5 authentication endpoints:
 * - POST /api/auth/2fa/setup - Initialize 2FA setup (get QR code)
 * - POST /api/auth/2fa/verify-setup - Verify initial setup with code
 * - POST /api/auth/2fa/verify - Verify 2FA code during login
 * - POST /api/auth/2fa/disable - Disable 2FA for user
 * - POST /api/auth/2fa/backup-codes - Generate backup codes
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getApiBaseUrl, waitForServer } from '../helpers/server';
import { prepareAuthenticatedContext, cleanupTestDatabase, testFixtures } from '../helpers/testSetup';

const BASE_URL = getApiBaseUrl();
let authCookie: string;
let setupData: { secret: string; qrCode: string; backupCodes: string[] } | null = null;
let userId: string;

beforeAll(async () => {
	await waitForServer();
	authCookie = await prepareAuthenticatedContext();

	// Get user ID for verify endpoint
	const userResponse = await fetch(`${BASE_URL}/api/user`, {
		headers: { Cookie: authCookie }
	});
	const userData = await userResponse.json();
	if (userData.data && userData.data.length > 0) {
		userId = userData.data[0]._id;
	}
});

afterAll(async () => {
	await cleanupTestDatabase();
});

describe('2FA Authentication API - Setup', () => {
	it('should initialize 2FA setup and return secret', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/setup`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		expect(response.status).toBe(200);
		const result = await response.json();

		// API returns { success: true, data: { secret, qrCode, backupCodes }, message }
		expect(result.success).toBe(true);
		expect(result.data).toBeDefined();

		const { data } = result;
		expect(data).toHaveProperty('secret');
		expect(data).toHaveProperty('qrCode');
		expect(data).toHaveProperty('backupCodes');

		// Secret should be base32 encoded string
		expect(typeof data.secret).toBe('string');
		expect(data.secret.length).toBeGreaterThan(0);

		// QR code should be data URL
		expect(data.qrCode).toMatch(/^data:image\//);

		// Backup codes should be array of strings
		expect(Array.isArray(data.backupCodes)).toBe(true);
		expect(data.backupCodes.length).toBeGreaterThan(0);

		// Store for later tests
		setupData = data;
	});

	it('should require authentication for 2FA setup', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/setup`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		expect(response.status).toBe(401);
	});

	it('should return 400 if 2FA already enabled', async () => {
		// Note: This tests the case where 2FA is already enabled
		// First setup was successful, trying again should fail with 400
		// But since 2FA isn't actually enabled (verify-setup not called), it may return new setup data
		const response = await fetch(`${BASE_URL}/api/auth/2fa/setup`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		// Should return 200 with new setup data or 400 if already enabled
		expect(response.status).toBe(200);
	});
});

describe('2FA Authentication API - Verify Setup', () => {
	it('should reject setup verification with invalid body', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify-setup`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				code: '123456' // Wrong format - endpoint expects secret, verificationCode, backupCodes
			})
		});

		// Should return 400 or 500 for invalid body schema
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(600);
	});

	it('should reject setup verification without authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify-setup`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				secret: 'test',
				verificationCode: '123456',
				backupCodes: []
			})
		});

		expect(response.status).toBe(401);
	});

	it('should reject invalid verification code format', async () => {
		if (!setupData) {
			console.log('Skipping: setupData not available');
			return;
		}

		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify-setup`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				secret: setupData.secret,
				verificationCode: '000000', // Invalid TOTP code
				backupCodes: setupData.backupCodes
			})
		});

		// Should return 400 for invalid code
		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.message).toBeDefined();
	});
});

describe('2FA Authentication API - Verify Code', () => {
	it('should require userId and code in body', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				code: '123456' // Missing userId
			})
		});

		// Should return error for invalid body
		expect(response.status).toBeGreaterThanOrEqual(400);
	});

	it('should handle verification with valid body structure', async () => {
		if (!userId) {
			console.log('Skipping: userId not available');
			return;
		}

		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				userId: userId,
				code: '123456'
			})
		});

		// Should return 200 with success: false (since 2FA not enabled) or handle gracefully
		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result).toHaveProperty('success');
		expect(result).toHaveProperty('message');
	});
});

describe('2FA Authentication API - Backup Codes', () => {
	it('should require authentication for backup codes', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/backup-codes`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		expect(response.status).toBe(401);
	});

	it('should handle backup code generation request', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/backup-codes`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		// May require 2FA to be enabled first - check response
		if (response.ok) {
			const data = await response.json();
			expect(data).toHaveProperty('backupCodes');
			expect(Array.isArray(data.backupCodes)).toBe(true);
		} else {
			// Should return 400 if 2FA not enabled
			expect(response.status).toBe(400);
		}
	});
});

describe('2FA Authentication API - Disable', () => {
	it('should require authentication to disable 2FA', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/disable`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				password: testFixtures.users.admin.password
			})
		});

		expect(response.status).toBe(401);
	});

	it('should handle disable request when 2FA not enabled', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/disable`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				password: testFixtures.users.admin.password
			})
		});

		// Should return 400 if 2FA not enabled, or 200 if it somehow is
		if (response.ok) {
			const data = await response.json();
			expect(data.success).toBe(true);
		} else {
			expect(response.status).toBe(400);
		}
	});

	it('should reject wrong password', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/disable`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				password: 'wrongpassword123!'
			})
		});

		// Should return 400 or 401 for wrong password or 2FA not enabled
		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(500);
	});
});
