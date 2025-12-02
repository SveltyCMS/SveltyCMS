/**
 * @file src/utils/clipboard.ts
 * @description Clipboard utility for Skeleton v4 migration
 *
 * Replaces the old Skeleton v2 `use:clipboard` action with native clipboard API.
 *
 * Usage:
 * ```svelte
 * <script>
 *   import { copyToClipboard } from '@utils/clipboard';
 * </script>
 *
 * <button onclick={() => copyToClipboard('text to copy')}>Copy</button>
 * ```
 */

import { toastState } from './toast';

export interface ClipboardOptions {
	/** Text to copy to clipboard */
	text: string;
	/** Show success toast message */
	showToast?: boolean;
	/** Custom success message */
	successMessage?: string;
	/** Custom error message */
	errorMessage?: string;
}

/**
 * Copy text to clipboard using the native Clipboard API
 */
export async function copyToClipboard(textOrOptions: string | ClipboardOptions): Promise<boolean> {
	const options: ClipboardOptions =
		typeof textOrOptions === 'string' ? { text: textOrOptions, showToast: true } : textOrOptions;

	const { text, showToast = true, successMessage = 'Copied to clipboard!', errorMessage = 'Failed to copy to clipboard' } = options;

	try {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(text);
		} else {
			// Fallback for older browsers
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.style.position = 'fixed';
			textarea.style.left = '-9999px';
			textarea.style.top = '-9999px';
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();
			const success = document.execCommand('copy');
			document.body.removeChild(textarea);

			if (!success) {
				throw new Error('execCommand copy failed');
			}
		}

		if (showToast) {
			toastState.add({
				type: 'success',
				title: successMessage,
				duration: 2000
			});
		}

		return true;
	} catch (error) {
		console.error('Clipboard copy failed:', error);

		if (showToast) {
			toastState.add({
				type: 'error',
				title: errorMessage,
				duration: 3000
			});
		}

		return false;
	}
}

/**
 * Svelte action for clipboard functionality (use:clipboard replacement)
 *
 * Usage:
 * ```svelte
 * <button use:clipboard={'text to copy'}>Copy</button>
 * <button use:clipboard={{ text: 'text', showToast: true }}>Copy</button>
 * ```
 */
export function clipboard(node: HTMLElement, options: string | ClipboardOptions) {
	const handleClick = async () => {
		await copyToClipboard(options);
	};

	node.addEventListener('click', handleClick);

	return {
		update(newOptions: string | ClipboardOptions) {
			options = newOptions;
		},
		destroy() {
			node.removeEventListener('click', handleClick);
		}
	};
}
