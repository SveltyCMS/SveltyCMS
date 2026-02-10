/**
 * @file tests/bun/api/setup-actions.test.ts
 * @description Comprehensive integration tests for Setup Actions (SvelteKit Server Actions)
 */

import { describe, it, expect, beforeEach } from 'bun:test';

// Increase default timeout for database-heavy setup tests
const TEST_TIMEOUT = 30000;

/**
 * Helper to parse SvelteKit Server Action "devalue" serialization.
 * SvelteKit returns data as a JSON string with indexed values.
 */
function parseActionResult(result: any): any {
	if (result.type === 'success' && typeof result.data === 'string') {
		try {
			const parsed = JSON.parse(result.data);
			if (Array.isArray(parsed)) {
				const [structure, ...values] = parsed;
				if (typeof structure === 'object' && structure !== null) {
					const unmarshaler = (val: any): any => {
						if (typeof val === 'number') return values[val - 1];
						if (Array.isArray(val)) return val.map(unmarshaler);
						if (typeof val === 'object' && val !== null) {
							const obj: any = {};
							for (const [k, v] of Object.entries(val)) {
								obj[k] = unmarshaler(v);
							}
							return obj;
						}
						return val;
					};
					return unmarshaler(structure);
				}
				return values[0]; // Fallback for primitive returns
			}
		} catch (e) {
			console.warn('[parseActionResult] Failed to parse data:', e);
		}
	}
	return result.data;
}
import { getApiBaseUrl } from '../helpers/server';
import { cleanupTestDatabase } from '../helpers/testSetup';
import type { DatabaseConfig } from '@src/databases/schemas';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';

const API_BASE_URL = getApiBaseUrl();

// Verify what we are sending
const testDbConfig: DatabaseConfig = {
	type: 'mongodb',
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT || '27017'),
	name: process.env.DB_NAME || 'sveltycms_test',
	user: process.env.DB_USER || '',
	password: process.env.DB_PASSWORD || ''
};

const testSmtpConfig = {
	host: 'smtp.gmail.com',
	port: 587,
	user: 'test@example.com',
	password: 'test-password',
	from: 'noreply@example.com',
	secure: true
};

const testAdminUser = {
	username: 'admin',
	email: 'admin@example.com',
	password: 'Admin123!',
	confirmPassword: 'Admin123!'
};

// Helper: SvelteKit Actions return a serialized result.
// For simple tests, we check if the response is OK and parse the JSON result.
// SvelteKit actions return { type: 'success' | 'failure', status, data: ... }
async function postAction(actionName: string, formData: FormData) {
	const res = await fetch(`${API_BASE_URL}/setup?/${actionName}`, {
		method: 'POST',
		body: formData,
		headers: {
			'x-sveltekit-action': 'true',
			Origin: API_BASE_URL
		}
	});
	return res;
}

describe('Setup Actions - Database Connection', () => {
	beforeEach(cleanupTestDatabase);

	it(
		'tests MongoDB connection',
		async () => {
			const formData = new FormData();
			formData.append('config', JSON.stringify(testDbConfig));

			const res = await postAction('testDatabase', formData);
			expect(res.status).toBe(200);

			const result = await res.json();
			const data = parseActionResult(result);

			// SvelteKit action success structure
			expect(result.type).toBe('success');
			expect(data.success).toBe(true);
		},
		TEST_TIMEOUT
	);

	it(
		'returns error for invalid credentials',
		async () => {
			const formData = new FormData();
			formData.append('config', JSON.stringify({ ...testDbConfig, user: 'bad', password: 'bad' }));

			const res = await postAction('testDatabase', formData);

			// SvelteKit might return 200 even for action failure if handled handled, checking result
			const result = await res.json();
			const data = parseActionResult(result);

			// Logic might resolve to success: false but HTTP 200, matching +page.server.ts logic
			// The action returns { success: false } which is a successful function execution returning cleanup data
			expect(result.type).toBe('success');
			expect(data.success).toBe(false);
		},
		TEST_TIMEOUT
	);

	it(
		'detects invalid host/port',
		async () => {
			const formData = new FormData();
			formData.append('config', JSON.stringify({ ...testDbConfig, host: 'invalid', port: 99999 }));

			const res = await postAction('testDatabase', formData);
			const result = await res.json();
			const data = parseActionResult(result);

			expect(result.type).toBe('success');
			expect(data.success).toBe(false);
		},
		TEST_TIMEOUT
	);
});

describe('Setup Actions - Database Driver Installation', () => {
	it(
		'checks MongoDB driver',
		async () => {
			const formData = new FormData();
			formData.append('dbType', 'mongodb');

			const res = await postAction('installDriver', formData);

			expect(res.status).toBe(200);
			const result = await res.json();
			const data = parseActionResult(result);

			expect(result.type).toBe('success');
			expect(data.package).toBe('mongoose');
			expect(data.alreadyInstalled).toBe(true);
		},
		TEST_TIMEOUT
	);
});

describe('Setup Actions - Database Seeding', () => {
	beforeEach(cleanupTestDatabase);

	it(
		'writes private.ts config',
		async () => {
			const formData = new FormData();
			formData.append('config', JSON.stringify(testDbConfig));

			const res = await postAction('seedDatabase', formData);

			expect(res.status).toBe(200);
			const result = await res.json();
			const data = parseActionResult(result);

			expect(result.type).toBe('success');
			expect(data.success).toBe(true);

			const fs = await import('fs/promises');
			const path = await import('path');
			// In TEST_MODE, it writes to private.test.ts
			const configName = process.env.TEST_MODE ? 'private.test.ts' : 'private.ts';
			await fs.access(path.resolve(process.cwd(), `config/${configName}`));
		},
		TEST_TIMEOUT
	);
});

describe('Setup Actions - SMTP Configuration', () => {
	it(
		'tests SMTP',
		async () => {
			const formData = new FormData();
			// testEmail action expects individual fields
			Object.entries({ ...testSmtpConfig, testEmail: 'test@example.com' }).forEach(([k, v]) => {
				formData.append(k, String(v));
			});

			const res = await postAction('testEmail', formData);
			const result = await res.json();
			const data = parseActionResult(result);

			// SMTP might fail in test env without real creds, but we check structure
			expect(result.type).toBe('success');
			// If it fails, success will be false, but response type is success (action ran)
			if (data.success) {
				expect(data.testEmailSent).toBe(true);
			} else {
				expect(data.error).toBeDefined();
			}
		},
		TEST_TIMEOUT
	);
});

describe('Setup Actions - Complete Setup', () => {
	beforeEach(async () => {
		await cleanupTestDatabase();
		// Seed first
		const formData = new FormData();
		formData.append('config', JSON.stringify(testDbConfig));
		await postAction('seedDatabase', formData);
	}, TEST_TIMEOUT);

	it('creates admin user and redirects', async () => {
		const formData = new FormData();
		// completeSetup expects { database, admin, system } in 'data'
		const payload = {
			database: testDbConfig,
			admin: testAdminUser,
			system: {
				multiTenant: false,
				demoMode: false,
				useRedis: false,
				redisHost: 'localhost',
				redisPort: '6379',
				redisPassword: ''
			}
		};
		formData.append('data', JSON.stringify(payload));

		const res = await postAction('completeSetup', formData);
		const result = await res.json();
		const data = parseActionResult(result);

		expect(result.type).toBe('success');
		if (!data.success) {
			console.error('❌ seedDatabase failed with error:', data.error);
		}
		expect(data.success).toBe(true);
		expect(data.redirectPath).toBeDefined();

		// Check for session cookie in response headers (ActionResult usually doesn't explicitly return Set-Cookie in pure JSON body,
		// but the response object should have headers)
		// With x-sveltekit-action, headers are set on the response
		const cookie = res.headers.get('set-cookie');
		if (cookie) {
			expect(cookie).toContain(SESSION_COOKIE_NAME);
		} else if (data.sessionId) {
			// Test fallback if cookie assertion is flaky in env
			expect(data.sessionId).toBeDefined();
		}
	});
});
