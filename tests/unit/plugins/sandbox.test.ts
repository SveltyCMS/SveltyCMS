/**
 * @file tests/unit/plugins/sandbox.test.ts
 * @description Unit tests for plugin sandbox isolation and security boundaries
 *
 * Features:
 * - Scoped DB access tests
 * - Protected collection blocking
 * - Query limit enforcement
 * - Error boundary tests
 */

import { describe, expect, it } from 'bun:test';
import { createScopedDbAdapter } from '@src/plugins/sandbox';

// Create a minimal mock dbAdapter for testing
// Functions accept variadic args to match the proxy's pass-through
function createMockAdapter(): any {
	const operations: string[] = [];

	return {
		crud: {
			findMany: (...args: any[]) => {
				operations.push(`findMany:${args[0]}`);
				return { success: true, data: [] };
			},
			insert: (...args: any[]) => {
				operations.push(`insert:${args[0]}`);
				return { success: true, data: { _id: 'test' } };
			},
			update: (...args: any[]) => {
				operations.push(`update:${args[0]}`);
				return { success: true };
			},
			delete: (...args: any[]) => {
				operations.push(`delete:${args[0]}`);
				return { success: true };
			},
			deleteMany: (...args: any[]) => {
				operations.push(`deleteMany:${args[0]}`);
				return { success: true };
			},
			count: (...args: any[]) => {
				operations.push(`count:${args[0]}`);
				return { success: true, data: 0 };
			}
		},
		_operations: operations
	};
}

describe('Plugin Sandbox - Scoped DB Access', () => {
	it('should allow read access to any non-protected collection', () => {
		const mock = createMockAdapter();
		const { adapter } = createScopedDbAdapter(mock, 'pagespeed');

		expect(() => adapter.crud.findMany('posts' as any, {} as any)).not.toThrow();
		expect(() => adapter.crud.findMany('media' as any, {} as any)).not.toThrow();
	});

	it('should allow write access to plugin-prefixed collections', () => {
		const mock = createMockAdapter();
		const { adapter } = createScopedDbAdapter(mock, 'pagespeed');

		expect(() => adapter.crud.insert('plugin_pagespeed_results' as any, {} as any, undefined as any, true)).not.toThrow();
		expect(() => adapter.crud.update('plugin_pagespeed_cache' as any, {} as any, {} as any)).not.toThrow();
	});

	it('should block write access to non-prefixed collections', () => {
		const mock = createMockAdapter();
		const { adapter } = createScopedDbAdapter(mock, 'pagespeed');

		expect(() => adapter.crud.insert('posts' as any, {} as any, undefined as any, true)).toThrow(/can only write to collections prefixed/);
		expect(() => adapter.crud.update('media' as any, {} as any, {} as any)).toThrow(/can only write to collections prefixed/);
	});

	it('should block access to protected system collections', () => {
		const mock = createMockAdapter();
		const { adapter } = createScopedDbAdapter(mock, 'pagespeed');

		expect(() => adapter.crud.findMany('users' as any, {} as any)).toThrow(/denied access to protected collection/);
		expect(() => adapter.crud.findMany('sessions' as any, {} as any)).toThrow(/denied access to protected collection/);
		expect(() => adapter.crud.findMany('tokens' as any, {} as any)).toThrow(/denied access to protected collection/);
		expect(() => adapter.crud.findMany('roles' as any, {} as any)).toThrow(/denied access to protected collection/);
		expect(() => adapter.crud.findMany('audit_logs' as any, {} as any)).toThrow(/denied access to protected collection/);
	});

	it('should track query count', () => {
		const mock = createMockAdapter();
		const { adapter, stats } = createScopedDbAdapter(mock, 'pagespeed');

		adapter.crud.findMany('posts' as any, {} as any);
		adapter.crud.findMany('blog' as any, {} as any);
		adapter.crud.count('items' as any, undefined as any);

		expect(stats.queryCount).toBe(3);
	});

	it('should enforce query limit', () => {
		const mock = createMockAdapter();
		const { adapter } = createScopedDbAdapter(mock, 'pagespeed');

		// Make 100 queries (the limit)
		for (let i = 0; i < 100; i++) {
			adapter.crud.findMany(`collection_${i}` as any, {} as any);
		}

		// 101st should throw
		expect(() => adapter.crud.findMany('one_too_many' as any, {} as any)).toThrow(/exceeded query limit/);
	});

	it('should enforce different plugin prefixes are isolated', () => {
		const mock = createMockAdapter();
		const { adapter: adapterA } = createScopedDbAdapter(mock, 'plugin_a');
		const { adapter: adapterB } = createScopedDbAdapter(mock, 'plugin_b');

		// Plugin A can write to its own prefix
		expect(() => adapterA.crud.insert('plugin_plugin_a_data' as any, {} as any, undefined as any, true)).not.toThrow();

		// Plugin A cannot write to Plugin B's prefix
		expect(() => adapterA.crud.insert('plugin_plugin_b_data' as any, {} as any, undefined as any, true)).toThrow(/can only write/);

		// Plugin B can write to its own prefix
		expect(() => adapterB.crud.insert('plugin_plugin_b_data' as any, {} as any, undefined as any, true)).not.toThrow();
	});
});
