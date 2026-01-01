/**
 * @file src/utils/toast.ts
 * Centralized toast utility for consistent notifications across modals/components.
 */

import { toaster } from '@stores/store.svelte';
import { logger } from '@utils/logger';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

/**
 * Displays a toast notification using Skeleton v4 toaster.
 * @param message The message to display.
 * @param type The type of toast (success, info, warning, error). Defaults to 'info'.
 * @param timeout Custom timeout in milliseconds. Defaults to 3000ms.
 */
export function showToast(message: string, type: ToastType = 'info', timeout: number = 3000): void {
	try {
		toaster.create({
			title: type.toUpperCase(),
			description: message,
			type: type === 'info' ? 'info' : type === 'success' ? 'success' : type === 'warning' ? 'loading' : 'error',
			duration: timeout
		});
	} catch (err) {
		logger.error('[toast] Failed to show toast:', err);
	}
}

/**
 * Backward compatibility: proxy for Skeleton v2 style calls.
 */
export function getToastStore() {
	return {
		trigger: (settings: { message: string; background?: string; timeout?: number }) => {
			const bg = settings.background || '';
			const type: ToastType = bg.includes('success') ? 'success' : bg.includes('error') ? 'error' : bg.includes('warning') ? 'warning' : 'info';
			showToast(settings.message, type, settings.timeout);
		},
		clear: () => {
			/* not easily supported by Skeleton v4 toaster.add directly, but could be added if needed */
		}
	};
}

/**
 * Backward compatibility: formerly used to set global store in layout.
 * Now a no-op as we use the singleton toaster.
 */
export function setGlobalToastStore(_store?: any): void {
	// No-op in v4
}
