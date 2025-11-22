/**
 * @file src/utils/toast.ts
 * Centralized toast utility for consistent notifications across modals/components.
 * Updated for Skeleton v4 with Zag.js toaster.
 */

import type { Service } from '@zag-js/toast';
import { logger } from '@utils/logger';

let toastStoreRef: Service | null = null;

export function setGlobalToastStore(store: Service): void {
	toastStoreRef = store;
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
		logger.warn('[toast] Toast store not initialized. Call setGlobalToastStore(createToaster()) in a root component.');
		return;
	}

	toastStoreRef.create({
		title: message,
		type: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
		duration: timeout || 3000
	});
}
