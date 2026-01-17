import 'clsx';
import { S as SvelteSet, b as SvelteMap } from './store.svelte.js';
const loadingOperations = {
	dataFetch: 'data-fetch',
	authentication: 'authentication',
	configSave: 'config-save'
};
class LoadingStore {
	_isLoading = false;
	_loadingReason = null;
	_loadingStack = new SvelteSet();
	_loadingEntries = new SvelteMap();
	_maxTimeout = 3e4;
	// 30 second max timeout for safety
	_progress = null;
	_canCancel = false;
	_onCancel = void 0;
	// Public getters
	get isLoading() {
		return this._isLoading;
	}
	get loadingReason() {
		return this._loadingReason;
	}
	get loadingStack() {
		return this._loadingStack;
	}
	get progress() {
		return this._progress;
	}
	get canCancel() {
		return this._canCancel;
	}
	get onCancel() {
		return this._onCancel;
	}
	/**
	 * Start a loading operation with automatic timeout protection
	 * @param reason - The loading operation type
	 * @param context - Optional context for debugging
	 * @param timeout - Custom timeout in ms (default: 30s)
	 */
	startLoading(reason, context, timeout = this._maxTimeout) {
		return;
	}
	/**
	 * Stop a loading operation and clean up
	 * @param reason - The loading operation type to stop
	 */
	stopLoading(reason) {
		return;
	}
	/**
	 * Update loading progress and cancellation for the current operation
	 */
	updateStatus(reason, progress, canCancel, onCancel) {
		return;
	}
	// Forcefully clear all loading states (emergency use only)
	clearLoading() {
		return;
	}
	// Check if a specific operation is currently loading
	isLoadingReason(reason) {
		return this._loadingStack.has(reason);
	}
	/**
	 * Wrap an async operation with automatic loading state management
	 * Handles errors and ensures cleanup even if promise rejects
	 *
	 * @example
	 * await globalLoadingStore.withLoading(
	 *   loadingOperations.dataFetch,
	 *   async () => {
	 *     const data = await fetch('/api/data');
	 *     return data.json();
	 *   }
	 * );
	 */
	async withLoading(reason, operation, context) {
		this.startLoading(reason, context);
		try {
			const result = await operation();
			return result;
		} catch (error) {
			console.error(`[LoadingStore] Operation "${reason}" failed:`, error);
			throw error;
		} finally {
			this.stopLoading(reason);
		}
	}
	// Get loading statistics (for debugging)
	getStats() {
		return null;
	}
}
const globalLoadingStore = new LoadingStore();
export { globalLoadingStore as g, loadingOperations as l };
//# sourceMappingURL=loadingStore.svelte.js.map
