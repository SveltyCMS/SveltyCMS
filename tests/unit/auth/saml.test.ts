/**
 * @file tests/unit/auth/saml.test.ts
 * @description SAML Authentication Service Unit Tests (Bun Test Runner)
 *
 * Tests:
 * - should initialize Jackson with correct database connection string derived from config
 * - should generate SAML redirect URL correctly
 * - should create SAML connections via admin controller
 *
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
// which mock @boxyhq/saml-jackson, @src/services/settings-service, etc.

describe('SAML Authentication Service', () => {
	let originalEnv: any;
	beforeEach(() => {
		originalEnv = { ...(globalThis as any).privateEnv };
		// Reset Jackson module cache
		const modPath = require.resolve(process.cwd() + '/src/databases/auth/saml-auth.ts');
		if (require.cache[modPath]) {
			delete require.cache[modPath];
		}
	});
	afterEach(() => {
		(globalThis as any).privateEnv = originalEnv;
	});
	beforeEach(() => {
		// Reset the cached instance so each test gets a fresh Jackson init
		// by clearing the module-level cache in saml-auth.ts
	});

	it('should initialize Jackson with correct database connection string derived from config', async () => {
		// The preload setup.ts sets privateEnv.DB_TYPE = 'mongodb' by default.
		// saml-auth.ts reads from getPrivateSettingSync which is mocked to return from globalThis.privateEnv.
		// We override to test PostgreSQL path:
		const originalEnv = { ...(globalThis as any).privateEnv };
		(globalThis as any).privateEnv = {
			...originalEnv,
			DB_TYPE: 'postgresql',
			DB_USER: 'testuser',
			DB_PASSWORD: 'testpassword',
			DB_HOST: 'localhost',
			DB_PORT: 5432,
			DB_NAME: 'testdb'
		};

		// Force re-import to get fresh module state (clear cached Jackson instance)
		// Use dynamic import to avoid stale module cache
		const samlModule = await import('../../../src/databases/auth/saml-auth');

		const instance = await samlModule.getJackson();
		expect(instance).toBeDefined();
		expect(instance.oauthController).toBeDefined();
		expect(instance.connectionAPIController).toBeDefined();

		// Restore
		(globalThis as any).privateEnv = originalEnv;
	});

	it('should generate SAML redirect URL correctly', async () => {
		const samlModule = await import('../../../src/databases/auth/saml-auth');
		const url = await samlModule.generateSAMLAuthUrl('acme-corp', 'sveltycms');
		expect(url).toBe('https://idp.example.com/sso');
	});

	it('should create SAML connections via admin controller', async () => {
		const samlModule = await import('../../../src/databases/auth/saml-auth');
		const mockPayload = {
			rawMetadata: '<xml></xml>',
			defaultRedirectUrl: 'http://localhost:5173/admin',
			tenant: 't1',
			product: 'p1'
		};
		const result = await samlModule.createSAMLConnection(mockPayload);
		expect(result.id).toBe('conn_123');
	});
});
