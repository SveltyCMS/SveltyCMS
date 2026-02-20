/**
 * @file src/utils/toast.ts
 * Centralized toast utility for consistent notifications across modals/components.
 */

import { toaster } from '@src/stores/store.svelte.ts';
import { logger } from '@utils/logger';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

/**
 * Displays a toast notification using Skeleton v4 toaster.
 * @param message The message to display.
 * @param type The type of toast (success, info, warning, error). Defaults to 'info'.
 * @param timeout Custom timeout in milliseconds. Defaults to 3000ms.
 */
export function showToast(message: string, type: ToastType = 'info', timeout = 3000): void {
	try {
		const toastData = {
			title: type.charAt(0).toUpperCase() + type.slice(1), // Title Case
			description: message,
			duration: timeout
		};

		switch (type) {
			case 'success':
				toaster.success(toastData);
				break;
			case 'warning':
				toaster.warning(toastData);
				break;
			case 'error':
				toaster.error(toastData);
				break;
			default:
				toaster.info(toastData);
				break;
		}
	} catch (err) {
		logger.error('[toast] Failed to show toast:', err);
	}
}
