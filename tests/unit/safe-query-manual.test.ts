import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Properly mock @src/databases/config-state
mock.module('@src/databases/config-state', () => ({
	getPrivateEnv: () => (globalThis as any).__privateEnv,
	setPrivateEnv: (env: any) => {
		(globalThis as any).__privateEnv = env;
	},
	loadPrivateConfig: () => Promise.resolve((globalThis as any).__privateEnv),
	clearPrivateConfigCache: () => {}
}));

import { safeQuery } from '../../src/utils/security/safe-query';

describe('safeQuery Hardening', () => {
	beforeEach(() => {
		// Reset global privateEnv before each test
		(globalThis as any).__privateEnv = null;
	});

	it('should allow scoped tenantId in multi-tenant mode', () => {
		// Set multi-tenant mode in the mocked config
		(globalThis as any).__privateEnv = { MULTI_TENANT: true };
		const query = { name: 'test' };
		const result = safeQuery(query, 'tenant-1');
		expect((result as any).tenantId).toBe('tenant-1');
		expect(result.name).toBe('test');
	});

	it('should throw error on null tenantId in multi-tenant mode', () => {
		// Set multi-tenant mode in the mocked config
		(globalThis as any).__privateEnv = { MULTI_TENANT: true };
		const query = { name: 'test' };
		// null should also throw in multi-tenant mode - this is the correct security behavior
		expect(() => safeQuery(query, null)).toThrow('Security Violation');
	});

	it('should throw error on undefined tenantId in multi-tenant mode', () => {
		// Set multi-tenant mode in the mocked config
		(globalThis as any).__privateEnv = { MULTI_TENANT: true };
		const query = { name: 'test' };
		expect(() => safeQuery(query, undefined)).toThrow('Security Violation');
	});

	it('should allow undefined tenantId in single-tenant mode', () => {
		// Set single-tenant mode in the mocked config
		(globalThis as any).__privateEnv = { MULTI_TENANT: false };
		const query = { name: 'test' };
		const result = safeQuery(query, undefined);
		expect((result as any).tenantId).toBeUndefined();
		expect(result.name).toBe('test');
	});

	it('should allow null tenantId in single-tenant mode', () => {
		// Set single-tenant mode in the mocked config
		(globalThis as any).__privateEnv = { MULTI_TENANT: false };
		const query = { name: 'test' };
		const result = safeQuery(query, null);
		expect(result.name).toBe('test');
	});

	it('should bypass tenant check with bypassTenantCheck option in multi-tenant mode', () => {
		// Set multi-tenant mode in the mocked config
		(globalThis as any).__privateEnv = { MULTI_TENANT: true };
		const query = { name: 'test' };
		// Even with undefined tenantId, bypassTenantCheck should allow the query
		const result = safeQuery(query, undefined, { bypassTenantCheck: true });
		expect(result.name).toBe('test');
	});
});
