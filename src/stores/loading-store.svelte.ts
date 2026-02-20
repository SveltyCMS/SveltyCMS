/**
 * @file src/stores/loading-store.svelte.ts
 * @description Enterprise-grade global loading state management aligned with SSR architecture.
 * Prevents UI flashes with intelligent context-aware loading states. Follows SveltyCMS state
 * management patterns: server-first, reactive, and self-optimizing.
 *
 * @example
 * import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
 * // Manual control
 * globalLoadingStore.startLoading(loadingOperations.dataFetch);
 * await fetchData();
 * globalLoadingStore.stopLoading(loadingOperations.dataFetch);
 *
 * await globalLoadingStore.withLoading(
 *   loadingOperations.dataFetch,
 *   async () => await fetchData()
 * );
 *
 * Features:
 * - SSR-safe: Guards against server-side execution
 * - Smart context detection: Auto-detects operation type from context
 * - Stack-based: Handles concurrent operations gracefully
 * - Auto-cleanup: Prevents stuck loading states with timeouts
 * - TypeScript: Full type safety with discriminated unions
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { browser } from '$app/environment';

// Predefined loading operations for consistency
export const loadingOperations = {
	navigation: 'navigation',
	dataFetch: 'data-fetch',
	authentication: 'authentication',
	initialization: 'initialization',
	imageUpload: 'image-upload',
	formSubmission: 'form-submission',
	configSave: 'config-save',
	roleManagement: 'role-management',
	permissionUpdate: 'permission-update',
	tokenGeneration: 'token-generation',
	collectionLoad: 'collection-load',
	widgetInit: 'widget-init'
} as const;

export type LoadingOperation = (typeof loadingOperations)[keyof typeof loadingOperations];

// Enhanced loading state with metadata
interface LoadingEntry {
	canCancel?: boolean;
	context?: string;
	onCancel?: () => void;
	progress?: number;
	reason: string;
	startTime: number;
	timeoutId?: ReturnType<typeof setTimeout>;
}

// Enterprise-grade loading store with automatic cleanup and SSR safety
export class LoadingStore {
	private _isLoading = $state(false);
	private _loadingReason = $state<string | null>(null);
	private readonly _loadingStack = $state<SvelteSet<string>>(new SvelteSet());
	private readonly _loadingEntries = new SvelteMap<string, LoadingEntry>();
	private readonly _maxTimeout = 30_000; // 30 second max timeout for safety
	private _progress = $state<number | null>(null);
	private _canCancel = $state(false);
	private _onCancel = $state<(() => void) | undefined>(undefined);

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
	startLoading(reason: string, context?: string, timeout: number = this._maxTimeout) {
		// SSR guard: Only run in browser
		if (!browser) {
			return;
		}

		// Prevent duplicate entries
		if (this._loadingStack.has(reason)) {
			console.warn(`[LoadingStore] Operation "${reason}" already in progress`);
			return;
		}

		// Create timeout to auto-cleanup stuck states
		const timeoutId = setTimeout(() => {
			console.warn(`[LoadingStore] Auto-cleanup: "${reason}" exceeded ${timeout}ms`);
			this.stopLoading(reason);
		}, timeout);

		// Add to stack and entries
		this._loadingStack.add(reason);
		this._loadingEntries.set(reason, {
			reason,
			startTime: Date.now(),
			context,
			timeoutId
		});

		this._isLoading = true;
		this._loadingReason = reason;

		if (context) {
			console.debug(`[LoadingStore] Started: ${reason} (${context})`);
		}
	}

	/**
	 * Stop a loading operation and clean up
	 * @param reason - The loading operation type to stop
	 */
	stopLoading(reason: string) {
		// SSR guard
		if (!browser) {
			return;
		}

		if (!this._loadingStack.has(reason)) {
			return; // Already stopped or never started
		}

		// Clear timeout and remove entry
		const entry = this._loadingEntries.get(reason);
		if (entry?.timeoutId) {
			clearTimeout(entry.timeoutId);
		}
		this._loadingEntries.delete(reason);

		// Remove from stack
		this._loadingStack.delete(reason);

		// Update state
		if (this._loadingStack.size === 0) {
			this._isLoading = false;
			this._loadingReason = null;
			this._progress = null;
			this._canCancel = false;
			this._onCancel = undefined;
		} else {
			// Update to most recent operation
			const entries = Array.from(this._loadingStack);
			const newReason = entries.at(-1);
			this._loadingReason = newReason;

			// Restore progress/cancel state of the active operation
			const newEntry = this._loadingEntries.get(newReason);
			if (newEntry) {
				this._progress = newEntry.progress ?? null;
				this._canCancel = newEntry.canCancel ?? false;
				this._onCancel = newEntry.onCancel;
			}
		}

		if (entry) {
			const duration = Date.now() - entry.startTime;
			console.debug(`[LoadingStore] Stopped: ${reason} (${duration}ms)`);
		}
	}

	/**
	 * Update loading progress and cancellation for the current operation
	 */
	updateStatus(reason: string, progress?: number, canCancel?: boolean, onCancel?: () => void) {
		if (!(browser && this._loadingEntries.has(reason))) {
			return;
		}

		const entry = this._loadingEntries.get(reason)!;

		if (progress !== undefined) {
			entry.progress = progress;
			if (this._loadingReason === reason) {
				this._progress = progress;
			}
		}

		if (canCancel !== undefined) {
			entry.canCancel = canCancel;
			if (this._loadingReason === reason) {
				this._canCancel = canCancel;
			}
		}

		if (onCancel !== undefined) {
			entry.onCancel = onCancel;
			if (this._loadingReason === reason) {
				this._onCancel = onCancel;
			}
		}

		this._loadingEntries.set(reason, entry);
	}

	// Forcefully clear all loading states (emergency use only)
	clearLoading() {
		if (!browser) {
			return;
		}

		// Clear all timeouts
		for (const entry of this._loadingEntries.values()) {
			if (entry.timeoutId) {
				clearTimeout(entry.timeoutId);
			}
		}

		this._loadingEntries.clear();
		this._loadingStack.clear();
		this._isLoading = false;
		this._loadingReason = null;
		this._progress = null;
		this._canCancel = false;
		this._onCancel = undefined;

		console.warn('[LoadingStore] Force cleared all loading states');
	}

	// Check if a specific operation is currently loading
	isLoadingReason(reason: string): boolean {
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
	async withLoading<T>(reason: string, operation: () => Promise<T>, context?: string): Promise<T> {
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
		if (!browser) {
			return null;
		}

		return {
			isLoading: this._isLoading,
			currentReason: this._loadingReason,
			activeCount: this._loadingStack.size,
			activeOperations: Array.from(this._loadingStack),
			entries: Array.from(this._loadingEntries.entries()).map(([reason, entry]) => ({
				reason,
				duration: Date.now() - entry.startTime,
				context: entry.context
			}))
		};
	}
}

// Create and export singleton instance
export const globalLoadingStore = new LoadingStore();
