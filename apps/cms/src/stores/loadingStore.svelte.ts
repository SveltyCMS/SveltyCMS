/**
 * @file src/stores/loadingStore.svelte.ts
 * @description Global loading state management for the application. This prevents UI flashes or content shifts by centralizing loading state management. It allows multiple asynchronous operations to register their loading state, and the UI will only show a loading indicator as long as at least one operation is in progress
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

// A set of predefined, named loading operations for consistency.
export const loadingOperations = {
	navigation: 'navigation',
	dataFetch: 'data-fetch',
	authentication: 'authentication',
	initialization: 'initialization',
	imageUpload: 'image-upload',
	formSubmission: 'form-submission'
} as const;

// Create a TypeScript type from the keys of the loadingOperations object.
export type LoadingOperation = (typeof loadingOperations)[keyof typeof loadingOperations];

// Global loading state for the entire application.
export class LoadingStore {
	private _isLoading = $state(false); // Reactive boolean indicating if any loading is active.
	private _loadingReason = $state<string | null>(null); // The reason for the current loading state.
	private _loadingStack = $state<SvelteSet<string>>(new SvelteSet()); // A stack to manage concurrent loading reasons.

	// Public getter for the loading status.
	get isLoading() {
		return this._isLoading;
	}

	// Public getter for the current loading reason.
	get loadingReason() {
		return this._loadingReason;
	}

	// Public getter for the loading stack.
	get loadingStack() {
		return this._loadingStack;
	}

	// Adds a reason to the stack and sets the loading state to true.
	startLoading(reason: string) {
		this._loadingStack.add(reason);
		this._isLoading = true;
		this._loadingReason = reason; // The reason is the last one added.
	}

	// Removes a reason from the stack and updates the loading state.
	stopLoading(reason: string) {
		this._loadingStack.delete(reason);

		// If the stack is empty, turn off the loading indicator.
		if (this._loadingStack.size === 0) {
			this._isLoading = false;
			this._loadingReason = null;
		} else {
			// Otherwise, update the reason to the most recent one still in the stack.
			this._loadingReason = Array.from(this._loadingStack)[this._loadingStack.size - 1];
		}
	}

	// Forcefully clears the loading stack and resets the state. Use with caution.
	clearLoading() {
		this._loadingStack.clear();
		this._isLoading = false;
		this._loadingReason = null;
	}

	// Checks if a specific loading operation is currently active.
	isLoadingReason(reason: string): boolean {
		return this._loadingStack.has(reason);
	}
}

// Create and export a single, global instance of the store.
export const globalLoadingStore = new LoadingStore();
