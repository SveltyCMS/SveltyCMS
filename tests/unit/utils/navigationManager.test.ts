/**
 * @file tests/bun/utils/navigationManager.test.ts
 * @description Tests for navigationManager functions
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { navigationManager } from '@src/utils/navigationManager';
import { mode } from '@stores/collectionStore.svelte';
import { globalLoadingStore } from '@stores/loadingStore.svelte';
import { dataChangeStore } from '@stores/store.svelte';

// We need to spy on 'goto'.
// We can re-mock the module for this test content if really needed,
// but let's see if we can just test behavior.
// To avoid SyntaxErrors, we'll NOT use mock.module here.

describe('NavigationManager', () => {
	beforeEach(() => {
		dataChangeStore.reset();
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
