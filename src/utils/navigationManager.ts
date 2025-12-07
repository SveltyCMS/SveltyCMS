/**
 * @file src/utils/navigationManager.ts
 * @description Centralized navigation manager to handle complex state transitions
 *
 * Features:
 * - Standardized navigation to list, edit, and create views
 * - URL/State consistency
 * - Global modal store management
 */
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { setCollectionValue } from '@src/stores/collectionStore.svelte';
import { dataChangeStore } from '@stores/store.svelte';
import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
import { modeStateMachine } from '@src/stores/modeStateMachine.svelte';
import { logger } from '@utils/logger';

/**
 * Centralized navigation manager to handle complex state transitions
 * and ensure URL/State consistency.
 */
export class NavigationManager {
	private navigationLock = false;

	/**
	 * Navigate to the list view of the current collection.
	 * Cleans up state, clears URL parameters, and ensures full reload.
	 *
	 * @param options - Navigation options
	 */
	async navigateToList(options?: { invalidate?: boolean }) {
		if (this.navigationLock) {
			logger.warn('[NavigationManager] Navigation already in progress');
			return;
		}

		this.navigationLock = true;
		globalLoadingStore.startLoading(loadingOperations.navigation, 'navigateToList');

		try {
			// 1. Dispatch save event BEFORE any state changes
			// This ensures +page.svelte updates its baseline and won't trigger auto-save
			if (typeof document !== 'undefined') {
				const saveEvent = new CustomEvent('entrySaved', {
					bubbles: true,
					detail: { timestamp: Date.now() }
				});
				document.dispatchEvent(saveEvent);
			}

			// 2. Reset change tracking (discard changes)
			dataChangeStore.reset();

			// 3. Clear collection value to prevent stale data on next load
			// IMPORTANT: Do this BEFORE mode transition to ensure clean state
			setCollectionValue({});

			// 4. Transition mode via state machine (enforces valid transition)
			const transitionSuccess = await modeStateMachine.transitionTo('view');

			if (!transitionSuccess) {
				logger.error('[NavigationManager] Mode transition failed, aborting navigation');
				return;
			}

			// 5. Get clean URL (removes ?create=true or ?edit=id)
			const cleanUrl = page.url.pathname;

			logger.debug('[NavigationManager] Navigating to:', cleanUrl);

			// 6. Navigate with optional invalidation
			await goto(cleanUrl, {
				invalidateAll: options?.invalidate ?? true,
				replaceState: false // Allow back button
			});

			logger.debug('[NavigationManager] Successfully navigated to list view');
		} catch (error) {
			logger.error('[NavigationManager] Navigation failed:', error);
			// Re-throw to allow caller to handle
			throw error;
		} finally {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
			this.navigationLock = false;
		}
	}

	/**
	 * Navigate to the edit view for a specific entry.
	 * @param entryId - The ID of the entry to edit
	 */
	async navigateToEdit(entryId: string) {
		if (this.navigationLock) {
			logger.warn('[NavigationManager] Navigation blocked by lock');
			return;
		}

		this.navigationLock = true;
		globalLoadingStore.startLoading(loadingOperations.navigation, 'navigateToEdit');

		try {
			// Validate entry ID
			if (!entryId || entryId.trim() === '') {
				logger.error('[NavigationManager] Invalid entry ID');
				return;
			}

			// Transition mode first
			const transitionSuccess = await modeStateMachine.transitionTo('edit');

			if (!transitionSuccess) {
				logger.error('[NavigationManager] Mode transition to edit failed');
				return;
			}

			// Navigate to edit URL
			const url = `${page.url.pathname}?edit=${entryId}`;
			await goto(url);

			logger.debug(`[NavigationManager] Navigated to edit view for entry ${entryId}`);
		} catch (error) {
			logger.error('[NavigationManager] Edit navigation failed:', error);
			throw error;
		} finally {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
			this.navigationLock = false;
		}
	}

	/**
	 * Navigate to the create view.
	 */
	async navigateToCreate() {
		if (this.navigationLock) {
			logger.warn('[NavigationManager] Navigation blocked by lock');
			return;
		}

		this.navigationLock = true;
		globalLoadingStore.startLoading(loadingOperations.navigation, 'navigateToCreate');

		try {
			// Transition mode first
			const transitionSuccess = await modeStateMachine.transitionTo('create');

			if (!transitionSuccess) {
				logger.error('[NavigationManager] Mode transition to create failed');
				return;
			}

			// Navigate to create URL
			const url = `${page.url.pathname}?create=true`;
			await goto(url);

			logger.debug('[NavigationManager] Navigated to create view');
		} catch (error) {
			logger.error('[NavigationManager] Create navigation failed:', error);
			throw error;
		} finally {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
			this.navigationLock = false;
		}
	}

	/**
	 * Check if navigation is currently in progress
	 */
	get isNavigating(): boolean {
		return this.navigationLock;
	}

	/**
	 * Force unlock navigation (use with caution, mainly for error recovery)
	 */
	forceUnlock(): void {
		logger.warn('[NavigationManager] Force unlocking navigation');
		this.navigationLock = false;
		globalLoadingStore.stopLoading(loadingOperations.navigation);
	}
}

export const navigationManager = new NavigationManager();
