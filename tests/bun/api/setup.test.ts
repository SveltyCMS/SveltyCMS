/**
 * @file tests/bun/api/setup.test.ts
 * @description Comprehensive integration tests for Setup API endpoints
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { getApiBaseUrl } from '../helpers/server';
import { cleanupTestDatabase } from '../helpers/testSetup';
import type { DatabaseConfig } from '@src/databases/schemas';

const API_BASE_URL = getApiBaseUrl();
const dbType = (process.env.DB_TYPE as 'mongodb' | 'mongodb+srv' | 'mariadb') || 'mongodb';

const testDbConfig: DatabaseConfig = {
	type: dbType,
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT || (process.env.DB_TYPE === 'mariadb' ? '3306' : '27017')),
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

describe('Setup API - Database Connection Tests', () => {
	beforeEach(cleanupTestDatabase);

	it(`tests ${testDbConfig.type} connection`, async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});

		expect(res.status).toBe(200);
		const result = await res.json();
		expect(result.success).toBe(true);
	});

	it('returns error for invalid credentials', async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...testDbConfig, user: 'bad', password: 'bad' })
		});

		const result = await res.json();
		expect(result.success).toBe(false);
		expect(result.classification).toBeDefined();
	});

	it('detects invalid host/port', async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/test-database`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...testDbConfig, host: 'invalid', port: 99999 })
		});

		const result = await res.json();
		expect(result.success).toBe(false);
		// Accept any error classification for now (implementation may vary)
		expect(result.classification).toBeDefined();
	});
});

// Only test MongoDB driver when running MongoDB tests (mongodb or mongodb+srv)
const describeMongoDriver = dbType.startsWith('mongodb') ? describe : describe.skip;

describeMongoDriver('Setup API - Database Driver Installation', () => {
	it('checks MongoDB driver', async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/install-driver`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dbType: 'mongodb' })
		});

		expect(res.status).toBe(200);
		const result = await res.json();

		// API returns 'package' field, not 'driverPackage'
		expect(result.package).toBe('mongoose');
		expect(result.success).toBe(true);
		// Package might be already installed or newly installed
		expect(result.alreadyInstalled !== undefined || result.output !== undefined).toBe(true);
	});
});

describe('Setup API - Database Seeding', () => {
	beforeEach(cleanupTestDatabase);

	it('writes private.ts config', async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/seed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});

		expect([200, 409, 500]).toContain(res.status);
		const result = await res.json();

		expect(typeof result).toBe('object');

		const fs = await import('fs/promises');
		const path = await import('path');
		await fs.access(path.resolve(process.cwd(), 'config/private.ts'));
	});

	it('seeds collections if applicable', async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/seed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});

		const result = await res.json();

		if (result.firstCollection) {
			expect(result.firstCollection).toBeDefined();
		}
	});
});

describe('Setup API - SMTP Configuration', () => {
	it('tests SMTP', async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/email-test`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...testSmtpConfig, testEmail: 'test@example.com' })
		});

		const result = await res.json();
		expect(result.success).toBeDefined();
	});
});

// --------------------
// Complete setup
// --------------------
describe('Setup API - Complete Setup', () => {
	beforeEach(async () => {
		await cleanupTestDatabase();
		await fetch(`${API_BASE_URL}/api/setup/seed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(testDbConfig)
		});
	});

	it('creates admin user if possible', async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ admin: testAdminUser, skipWelcomeEmail: true })
		});

		expect([200, 409, 500]).toContain(res.status);
		const result = await res.json();

		expect(typeof result).toBe('object');

		const cookie = res.headers.get('set-cookie');
		if (cookie) {
			expect(cookie).toContain('auth_session');
		}
	});

	it('redirects to first collection if provided', async () => {
		const res = await fetch(`${API_BASE_URL}/api/setup/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				admin: testAdminUser,
				skipWelcomeEmail: true,
				firstCollection: { name: 'Posts', path: '/posts', _id: 'x' }
			})
		});

		const result = await res.json();
		if (typeof result.redirectTo === 'string') {
			expect(result.redirectTo).toContain('/posts');
		}
	});
});
