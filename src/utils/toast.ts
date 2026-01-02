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
			title: type.charAt(0).toUpperCase() + type.slice(1), // Title Case (Success, Error, Info, Warning)
			description: message,
			type: type,
			duration: timeout
		});
	} catch (err) {
		logger.error('[toast] Failed to show toast:', err);
	}
}
