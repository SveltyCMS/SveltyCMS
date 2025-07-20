/**
 * @file src/stores/loadingStore.svelte.ts
 * @description Global loading state management for preventing black screens
 *
 * @example
 * import { globalLoadingStore } from '@stores/loadingStore.svelte';
 *
 * Features:
 * - Global loading state management for preventing black screens
 * - Reactive loading state management with auto-refresh
 * - Error handling for API calls
 * - TypeScript support
 */

import { SvelteSet } from 'svelte/reactivity';

// Global loading state for the entire application
export class LoadingStore {
	private _isLoading = $state(false);
	private _loadingReason = $state<string | null>(null);
	private _loadingStack = $state<SvelteSet<string>>(new SvelteSet());

	get isLoading() {
		return this._isLoading;
	}

	get loadingReason() {
		return this._loadingReason;
	}

	get loadingStack() {
		return this._loadingStack;
	}

	// Start a loading operation with a specific reason
	startLoading(reason: string) {
		this._loadingStack.add(reason);
		this._isLoading = true;
		this._loadingReason = reason;
	}

	// Stop a loading operation for a specific reason
	stopLoading(reason: string) {
		this._loadingStack.delete(reason);

		if (this._loadingStack.size === 0) {
			this._isLoading = false;
			this._loadingReason = null;
		} else {
			// Set the reason to the most recent remaining operation
			this._loadingReason = Array.from(this._loadingStack)[this._loadingStack.size - 1];
		}
	}

	// Clear all loading operations (use with caution)
	clearLoading() {
		this._loadingStack.clear();
		this._isLoading = false;
		this._loadingReason = null;
	}

	// Check if a specific loading operation is active
	isLoadingReason(reason: string): boolean {
		return this._loadingStack.has(reason);
	}
}

// Global instance
export const globalLoadingStore = new LoadingStore();

// Convenience functions for common loading operations
export const loadingOperations = {
	navigation: 'navigation',
	dataFetch: 'data-fetch',
	authentication: 'authentication',
	initialization: 'initialization',
	imageUpload: 'image-upload',
	formSubmission: 'form-submission'
} as const;

export type LoadingOperation = (typeof loadingOperations)[keyof typeof loadingOperations];
