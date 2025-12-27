/**
 * @file src/utils/navigationManager.ts
 * @description Centralized navigation manager for consistent state transitions
 *
 * Features:
 * - Prevents concurrent navigation
 * - Coordinated mode transitions
 * - Loading state management
 * - Clean URL handling
 * - Event dispatch for save coordination
 */

import { goto } from '$app/navigation';
import { page } from '$app/state';

// Stores
import { modeStateMachine } from '@src/stores/modeStateMachine.svelte';
import { setCollectionValue } from '@src/stores/collectionStore.svelte';
import { dataChangeStore } from '@stores/store.svelte';
import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

// Utils
import { logger } from '@utils/logger';

export class NavigationManager {
	private navigating = false;

	get isNavigating(): boolean {
		return this.navigating;
	}

	/**
	 * Generic wrapper to handle navigation locking, logging, and error handling
	 */
	private async executeNavigation(action: string, task: () => Promise<void>): Promise<void> {
		if (this.navigating) {
			logger.warn(`[NavigationManager] ${action} blocked - navigation in progress`);
			return;
		}

		this.navigating = true;
		globalLoadingStore.startLoading(loadingOperations.navigation, action);

		try {
			await task();
		} catch (err) {
			logger.error(`[NavigationManager] ${action} failed`, err);
			// We choose not to re-throw here to prevent unhandled promise rejections in UI handlers,
			// unless the caller specificially awaits and needs to know.
			// But for consistency with previous implementation, we re-throw.
			throw err;
		} finally {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
			this.navigating = false;
		}
	}

	// Navigate to list view (clean state)
	async toList(options?: { invalidate?: boolean }): Promise<void> {
		await this.executeNavigation('toList', async () => {
			// Signal save completion (prevents auto-draft/save triggers)
			if (typeof document !== 'undefined') {
				document.dispatchEvent(
					new CustomEvent('entrySaved', {
						bubbles: true,
						detail: { timestamp: Date.now() }
					})
				);
			}

			// Reset changes & clear entry
			dataChangeStore.reset();
			setCollectionValue({});

			// Transition mode
			const ok = await modeStateMachine.transitionTo('view');
			if (!ok) {
				logger.error('[NavigationManager] Failed to transition to view mode');
				return;
			}

			const cleanUrl = page.url.pathname;
			await goto(cleanUrl, {
				invalidateAll: options?.invalidate ?? true,
				replaceState: false
			});
			logger.debug('[NavigationManager] Navigated to list view');
		});
	}

	// Alias for backward compatibility
	async navigateToList(options?: { invalidate?: boolean }): Promise<void> {
		return this.toList(options);
	}

	// Navigate to edit entry
	async toEdit(entryId: string): Promise<void> {
		if (!entryId?.trim()) {
			logger.warn('[NavigationManager] Edit navigation aborted: Invalid ID');
			return;
		}

		await this.executeNavigation(`toEdit(${entryId})`, async () => {
			const ok = await modeStateMachine.transitionTo('edit');
			if (!ok) {
				logger.error('[NavigationManager] Failed to transition to edit mode');
				return;
			}

			await goto(`${page.url.pathname}?edit=${entryId}`);
			logger.debug(`[NavigationManager] Navigated to edit: ${entryId}`);
		});
	}

	// Alias for backward compatibility
	async navigateToEdit(entryId: string): Promise<void> {
		return this.toEdit(entryId);
	}

	// Navigate to create view
	async toCreate(): Promise<void> {
		await this.executeNavigation('toCreate', async () => {
			const ok = await modeStateMachine.transitionTo('create');
			if (!ok) {
				logger.error('[NavigationManager] Failed to transition to create mode');
				return;
			}

			await goto(`${page.url.pathname}?create=true`);
			logger.debug('[NavigationManager] Navigated to create view');
		});
	}

	// Alias for backward compatibility
	async navigateToCreate(): Promise<void> {
		return this.toCreate();
	}

	// Force unlock (error recovery)
	forceUnlock(): void {
		logger.warn('[NavigationManager] Force unlock triggered');
		this.navigating = false;
		globalLoadingStore.stopLoading(loadingOperations.navigation);
	}
}

export const navigationManager = new NavigationManager();
