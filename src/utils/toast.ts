/**
 * @file src/utils/toast.ts
 * Centralized toast utility for consistent notifications across modals/components.
 */

import { createToaster } from '@skeletonlabs/skeleton-svelte';
import type { Store as ToastStore } from '@zag-js/toast';

let toastStoreRef: ToastStore | null = null;

export function setGlobalToastStore(store?: ToastStore): void {
	toastStoreRef = store ?? createToaster();
}

export type ToastType = 'success' | 'info' | 'warning' | 'error';

/**
 * Displays a toast notification.
 * @param message The message to display. Can include HTML (e.g., iconify-icon).
 * @param type The type of toast (success, info, warning, error). Defaults to 'info'.
 * @param timeout Custom timeout in milliseconds. Defaults to 3000ms.
 */
export function showToast(message: string, type: ToastType = 'info', timeout?: number): void {
	if (!toastStoreRef) {
		console.warn('[toast] Toast store not initialized. Call setGlobalToastStore(createToaster()) in a root component.');
		return;
	}

	const duration = timeout ?? 3000;
	switch (type) {
		case 'success':
			toastStoreRef.success({ title: message, duration });
			break;
		case 'error':
			toastStoreRef.error({ title: message, duration });
			break;
		case 'warning':
			toastStoreRef.warning({ title: message, duration });
			break;
		case 'info':
		default:
			toastStoreRef.info({ title: message, duration });
			break;
	}
}
