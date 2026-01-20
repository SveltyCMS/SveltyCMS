/**
 * @file tests/bun/setup.ts
 * @description Setup for running Svelte tests with Bun.
 */

import { mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// Mock @zag-js/svelte (required by Skeleton UI components)
mock.module('@zag-js/svelte', () => ({
	useMachine: () => ({}),
	normalizeProps: (props: unknown) => props,
	useSnapshot: () => ({}),
	mergeProps: (...props: unknown[]) => Object.assign({}, ...props)
}));

// Mock logger to prevent errors in tests
mock.module('@shared/utils/logger', () => ({
	logger: {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
		trace: () => {}
	}
}));
mock.module('@shared/utils/logger.server', () => ({
	logger: {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
		trace: () => {}
	}
}));

// Mock server-side crypto modules for client-side tests
mock.module('crypto', () => ({
	default: {
		randomBytes: (size: number) => new Uint8Array(size),
		createHash: () => ({
			update: () => ({
				digest: () => 'mocked_hash'
			})
		}),
		randomUUID: () => 'mocked-uuid',
		createCipheriv: () => ({
			update: () => Buffer.from(''),
			final: () => Buffer.from(''),
			getAuthTag: () => Buffer.from('')
		}),
		createDecipheriv: () => ({
			update: () => Buffer.from(''),
			final: () => Buffer.from(''),
			setAuthTag: () => {}
		})
	}
}));

mock.module('argon2', () => ({
	default: {
		hash: async (password: string) => `mocked_hash_${password}`,
		verify: async (hash: string, password: string) => hash === `mocked_hash_${password}`,
		argon2id: 2
	}
}));

// Mock $app/environment
mock.module('$app/environment', () => ({
	browser: true, // Set to true for component tests
	dev: true,
	building: false,
	version: 'test'
}));

// Mock $app/navigation
mock.module('$app/navigation', () => ({
	goto: () => Promise.resolve(),
	invalidate: () => Promise.resolve(),
	invalidateAll: () => Promise.resolve(),
	preloadData: () => Promise.resolve(),
	preloadCode: () => Promise.resolve(),
	beforeNavigate: () => {},
	afterNavigate: () => {}
}));

// Mock $app/stores
mock.module('$app/stores', () => ({
	getStores: () => ({}),
	page: {
		subscribe: (fn: any) => fn({ url: new URL('http://localhost'), params: {}, route: { id: null }, status: 200, error: null, data: {}, form: null })
	},
	navigating: { subscribe: (fn: any) => fn(null) },
	updated: { subscribe: (fn: any) => fn(false) }
}));

// Mock $app/state (SvelteKit 2.0+)
mock.module('$app/state', () => ({
	state: { subscribe: (fn: (val: object) => void) => fn({}) },
	page: {
		url: new URL('http://localhost'),
		params: {},
		route: { id: null },
		status: 200,
		error: null,
		data: {},
		form: null
	}
}));

// Mock Svelte 5 Runes for testing
globalThis.$state = ((initial: unknown) => initial) as typeof $state;
globalThis.$derived = ((fn: unknown) => (typeof fn === 'function' ? fn() : fn)) as typeof $derived;
globalThis.$effect = (() => {}) as typeof $effect;
