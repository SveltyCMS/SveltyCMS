/**
 * @file src/utils/toast.ts
 * Centralized toast utility for consistent notifications across modals/components.
 */

import { getToastStore, type ToastStore } from '@skeletonlabs/skeleton';

let toastStoreRef: ToastStore | null = null;

export function setGlobalToastStore(store?: ToastStore): void {
	toastStoreRef = store ?? getToastStore();
}

export type ToastType = 'success' | 'info' | 'warning' | 'error';

/**
 * Displays a toast notification.
 * @param message The message to display. Can include HTML (e.g., iconify-icon).
 * @param type The type of toast (success, info, warning, error). Defaults to 'info'.
 */
export function showToast(message: string, type: ToastType = 'info'): void {
	const backgrounds: Record<ToastType, string> = {
		success: 'gradient-primary',
		info: 'gradient-tertiary',
		warning: 'gradient-warning',
		error: 'gradient-error'
	};
	if (!toastStoreRef) {
		console.warn('[toast] Toast store not initialized. Call setGlobalToastStore(getToastStore()) in a root component.');
		return;
	}
	toastStoreRef.trigger({
		message,
		background: backgrounds[type],
		timeout: 3000,
		classes: 'border-1 !rounded-md'
	});
}
