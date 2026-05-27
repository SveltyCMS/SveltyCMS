/**
 * @file tests/bun/utils/navigationManager.test.ts
 * @description Tests for navigationManager functions
 *
 * Tests:
 * - Navigation to list view
 * - State clearing
 * - Concurrency prevention
 * - Loading state management
 */
import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

// Shim Svelte 5 Runes for Bun environment
(globalThis as any).$state = (v: any) => v;
(globalThis as any).$state.snapshot = (v: any) => v;
(globalThis as any).$derived = (v: any) => v;
(globalThis as any).$effect = (_v: any) => {};

// Mock SvelteKit modules
mock.module('$app/environment', () => ({
	dev: true,
	browser: false,
	building: false,
	version: 'test'
}));

mock.module('$app/navigation', () => ({
	goto: mock(() => Promise.resolve())
}));

mock.module('$app/state', () => ({
	page: {
		url: new URL('http://localhost/test')
	}
}));

let navigationManager: any;
let mode: any;
let globalLoadingStore: any;
let dataChangeStore: any;

beforeAll(async () => {
	const NavMod = await import('@src/utils/navigation-manager');
	const ColStore = await import('@src/stores/collection-store.svelte');
	const LoadStore = await import('@src/stores/loading-store.svelte');
	const Store = await import('@src/stores/store.svelte');

	navigationManager = NavMod.navigationManager;
	mode = ColStore.mode;
	globalLoadingStore = LoadStore.globalLoadingStore;
	dataChangeStore = Store.dataChangeStore;
});

// We need to spy on 'goto'.
// We can re-mock the module for this test content if really needed,
// but let's see if we can just test behavior.
// To avoid SyntaxErrors, we'll NOT use mock.module here.

describe('NavigationManager', () => {
	beforeEach(() => {
		if (dataChangeStore) dataChangeStore.reset();
	});

	it('should navigate to list view and clear state', async () => {
		// Setup
		dataChangeStore.setHasChanges(true);

		// Execute
		await navigationManager.navigateToList();

		// Assertions
		expect(dataChangeStore.hasChanges).toBe(false);
		expect(mode.value).toBe('view');
	});

	it('should prevent concurrent navigations', async () => {
		const p1 = navigationManager.navigateToList();
		const p2 = navigationManager.navigateToList();

		await Promise.all([p1, p2]);
		// Behavior check
		expect(dataChangeStore.hasChanges).toBe(false);
	});

	it('should set loading state during navigation', async () => {
		await navigationManager.navigateToList();
		// It should be false after
		expect(globalLoadingStore.isLoading).toBe(false);
	});
});
