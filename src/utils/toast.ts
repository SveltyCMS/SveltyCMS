/**
 * @file src/utils/toast.ts
 * Centralized toast utility for consistent notifications across modals/components.
 * Updated for Skeleton v4 - uses createToaster from zag-js
 */

import { createToaster } from '@skeletonlabs/skeleton-svelte';
import { logger } from '@utils/logger';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
	title: string;
	description?: string;
	type?: ToastType;
	duration?: number;
}

// Create a toaster instance for Skeleton v4
const toaster = createToaster({
	placement: 'bottom-end',
	overlap: true,
	gap: 16,
	duration: 3000
});

// Export the toaster for use in Toast.Group component
export const toastState = {
	toaster,

	add(options: ToastOptions) {
		return toaster.create({
			title: options.title,
			description: options.description,
			type: options.type || 'info',
			duration: options.duration ?? 3000
		});
	},

	remove(id: string) {
		toaster.dismiss(id);
	},

	clear() {
		toaster.dismiss();
	}
};

/**
 * Displays a toast notification.
 * @param message The message to display (used as title)
 * @param type The type of toast (success, info, warning, error). Defaults to 'info'.
 * @param duration Custom duration in milliseconds. Defaults to 3000ms.
 */
export function showToast(message: string, type: ToastType = 'info', duration: number = 3000): string {
	return toastState.add({
		title: message,
		type,
		duration
	});
}

// Legacy compatibility - these functions are no-ops now but prevent import errors
export function setGlobalToastStore(): void {
	logger.debug('[toast] setGlobalToastStore is deprecated in Skeleton v4');
}

// For backwards compatibility with code that uses getToastStore pattern
export function getToastStore() {
	return {
		trigger: (options: { message: string; background?: string; timeout?: number }) => {
			// Map old background classes to new types
			let type: ToastType = 'info';
			if (options.background?.includes('error')) type = 'error';
			else if (options.background?.includes('success') || options.background?.includes('primary')) type = 'success';
			else if (options.background?.includes('warning')) type = 'warning';

			showToast(options.message, type, options.timeout);
		},
		clear: () => toastState.clear()
	};
}
