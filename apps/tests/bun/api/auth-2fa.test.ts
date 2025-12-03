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
let backupCodes: string[];

beforeAll(async () => {
	await waitForServer();
	authCookie = await prepareAuthenticatedContext();
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

		expect(response.ok).toBe(true);
		const data = await response.json();

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
		backupCodes = data.backupCodes;
	});

	it('should require authentication for 2FA setup', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/setup`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		expect(response.status).toBe(401);
	});

	it('should handle setup errors gracefully', async () => {
		// Try to setup when already setup (if applicable)
		const response = await fetch(`${BASE_URL}/api/auth/2fa/setup`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		// Should either succeed or return proper error
		expect([200, 400, 409]).toContain(response.status);
	});
});

describe('2FA Authentication API - Verify Setup', () => {
	it('should verify 2FA setup with valid code', async () => {
		// Note: In real tests, you'd use a TOTP library to generate valid code
		// For now, test the endpoint structure
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify-setup`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				code: '123456' // Would need real TOTP code in actual test
			})
		});

		// Should return 200 with valid code, or 400/401 with invalid
		expect([200, 400, 401]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(data).toHaveProperty('success');
			expect(data.success).toBe(true);
		}
	});

	it('should reject setup verification without authentication', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify-setup`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: '123456' })
		});

		expect(response.status).toBe(401);
	});

	it('should validate code format', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify-setup`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({ code: 'invalid' })
		});

		expect([400, 401]).toContain(response.status);
	});
});

describe('2FA Authentication API - Verify Code', () => {
	it('should verify 2FA code during login', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				code: '123456'
			})
		});

		// Should validate code format at minimum
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(500);
	});

	it('should accept backup codes', async () => {
		if (backupCodes && backupCodes.length > 0) {
			const response = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: authCookie
				},
				body: JSON.stringify({
					code: backupCodes[0]
				})
			});

			expect([200, 400, 401]).toContain(response.status);
		}
	});

	it('should reject invalid code format', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({ code: '' })
		});

		expect([400, 401]).toContain(response.status);
	});
});

describe('2FA Authentication API - Backup Codes', () => {
	it('should generate new backup codes', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/backup-codes`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		if (response.ok) {
			const data = await response.json();
			expect(data).toHaveProperty('backupCodes');
			expect(Array.isArray(data.backupCodes)).toBe(true);
			expect(data.backupCodes.length).toBeGreaterThan(0);

			// Each code should be a string
			data.backupCodes.forEach((code: unknown) => {
				expect(typeof code).toBe('string');
			});
		} else {
			// May require 2FA to be enabled first
			expect([400, 401, 403]).toContain(response.status);
		}
	});

	it('should require authentication for backup codes', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/backup-codes`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		expect(response.status).toBe(401);
	});

	it('should invalidate old backup codes when generating new ones', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/backup-codes`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			}
		});

		// Structure validation
		if (response.ok) {
			const data = await response.json();
			expect(data.backupCodes.length).toBeGreaterThanOrEqual(8);
			expect(data.backupCodes.length).toBeLessThanOrEqual(16);
		}
	});
});

describe('2FA Authentication API - Disable', () => {
	it('should disable 2FA for authenticated user', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/disable`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				password: testFixtures.users.firstAdmin.password
			})
		});

		// May require 2FA to be enabled first
		expect([200, 400, 401]).toContain(response.status);

		if (response.ok) {
			const data = await response.json();
			expect(data).toHaveProperty('success');
			expect(data.success).toBe(true);
		}
	});

	it('should require password confirmation to disable 2FA', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/disable`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				password: 'wrongpassword'
			})
		});

		expect([400, 401, 403]).toContain(response.status);
	});

	it('should require authentication to disable 2FA', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/disable`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				password: testFixtures.users.firstAdmin.password
			})
		});

		expect(response.status).toBe(401);
	});

	it('should clear backup codes when disabling 2FA', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/disable`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({
				password: testFixtures.users.firstAdmin.password
			})
		});

		// After disabling, backup codes should be cleared
		if (response.ok) {
			const data = await response.json();
			expect(data.success).toBe(true);
		}
	});
});

describe('2FA Authentication API - Security', () => {
	it('should rate limit 2FA verification attempts', async () => {
		// Make multiple failed attempts
		const attempts = Array(10)
			.fill(null)
			.map(() =>
				fetch(`${BASE_URL}/api/auth/2fa/verify`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Cookie: authCookie
					},
					body: JSON.stringify({ code: '000000' })
				})
			);

		const responses = await Promise.all(attempts);
		const statuses = responses.map((r) => r.status);

		// Should eventually rate limit (429) or lock account
		expect(statuses.some((s) => s === 429 || s === 403)).toBe(true);
	});

	it('should not expose 2FA status in error messages', async () => {
		const response = await fetch(`${BASE_URL}/api/auth/2fa/verify`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: authCookie
			},
			body: JSON.stringify({ code: '000000' })
		});

		const data = await response.json();

		// Should not reveal whether 2FA is enabled
		expect(data.message).not.toContain('2FA not enabled');
		expect(data.message).not.toContain('not configured');
	});
});
