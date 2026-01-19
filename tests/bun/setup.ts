/**
 * @file tests/bun/setup.ts
 * @description Setup for running Svelte tests with Bun.
 */

import { mock } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// Mock $app/environment
mock.module('$app/environment', () => ({
	browser: false,
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

// Mock Svelte 5 Runes for testing
globalThis.$state = ((initial) => initial) as any;
globalThis.$derived = ((fn) => (typeof fn === 'function' ? fn() : fn)) as any;
globalThis.$effect = (() => {}) as any;
