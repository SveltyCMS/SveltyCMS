/**
 * @file src/utils/dialogState.svelte.ts
 * @description Dialog state management for Skeleton v4 Dialog component
 *
 * This provides a Skeleton v4 compatible dialog management system that replaces
 * the old Modal store pattern from Skeleton v2.
 *
 * Usage:
 * ```svelte
 * import { dialogState, showConfirmDialog } from '@utils/dialogState.svelte';
 *
 * // Show a confirm dialog
 * showConfirmDialog({
 *   title: 'Confirm Delete',
 *   description: 'Are you sure?',
 *   onConfirm: () => console.log('confirmed')
 * });
 * ```
 */

import { SvelteComponent } from 'svelte';

// Types for dialog configuration
export interface DialogConfig {
	id: string;
	open: boolean;
	title?: string;
	description?: string;
	type: 'alert' | 'confirm' | 'component' | 'custom';
	// For confirm dialogs
	confirmText?: string;
	cancelText?: string;
	confirmClasses?: string;
	cancelClasses?: string;
	// Callbacks
	onConfirm?: () => void | Promise<void>;
	onCancel?: () => void;
	onClose?: () => void;
	// For component dialogs
	component?: typeof SvelteComponent<any>;
	componentProps?: Record<string, any>;
	// Additional metadata
	meta?: Record<string, any>;
}

export interface ConfirmDialogOptions {
	title: string;
	description: string;
	confirmText?: string;
	cancelText?: string;
	confirmClasses?: string;
	cancelClasses?: string;
	onConfirm?: () => void | Promise<void>;
	onCancel?: () => void;
}

export interface ComponentDialogOptions {
	component: typeof SvelteComponent<any>;
	componentProps?: Record<string, any>;
	title?: string;
	description?: string;
	onClose?: (result?: any) => void;
	meta?: Record<string, any>;
}

// Dialog state manager class using Svelte 5 runes
class DialogStateManager {
	// Stack of active dialogs
	dialogs = $state<DialogConfig[]>([]);

	// Counter for unique IDs
	private idCounter = 0;

	/**
	 * Generate a unique dialog ID
	 */
	private generateId(): string {
		return `dialog-${++this.idCounter}-${Date.now()}`;
	}

	/**
	 * Open a new dialog
	 */
	open(config: Omit<DialogConfig, 'id' | 'open'>): string {
		const id = this.generateId();
		const dialog: DialogConfig = {
			...config,
			id,
			open: true
		};
		this.dialogs = [...this.dialogs, dialog];
		return id;
	}

	/**
	 * Close a specific dialog by ID
	 */
	close(id: string): void {
		const dialog = this.dialogs.find((d) => d.id === id);
		if (dialog?.onClose) {
			dialog.onClose();
		}
		this.dialogs = this.dialogs.filter((d) => d.id !== id);
	}

	/**
	 * Close the topmost dialog
	 */
	closeTop(): void {
		if (this.dialogs.length > 0) {
			const topDialog = this.dialogs[this.dialogs.length - 1];
			this.close(topDialog.id);
		}
	}

	/**
	 * Close all dialogs
	 */
	closeAll(): void {
		this.dialogs.forEach((d) => d.onClose?.());
		this.dialogs = [];
	}

	/**
	 * Get the topmost dialog
	 */
	get current(): DialogConfig | undefined {
		return this.dialogs.length > 0 ? this.dialogs[this.dialogs.length - 1] : undefined;
	}

	/**
	 * Check if any dialog is open
	 */
	get hasOpen(): boolean {
		return this.dialogs.length > 0;
	}

	/**
	 * Handle confirm action for a dialog
	 */
	async handleConfirm(id: string): Promise<void> {
		const dialog = this.dialogs.find((d) => d.id === id);
		if (dialog?.onConfirm) {
			await dialog.onConfirm();
		}
		this.close(id);
	}

	/**
	 * Handle cancel action for a dialog
	 */
	handleCancel(id: string): void {
		const dialog = this.dialogs.find((d) => d.id === id);
		if (dialog?.onCancel) {
			dialog.onCancel();
		}
		this.close(id);
	}
}

// Export singleton instance
export const dialogState = new DialogStateManager();

// Convenience functions

/**
 * Show a confirmation dialog
 */
export function showConfirmDialog(options: ConfirmDialogOptions): string {
	return dialogState.open({
		type: 'confirm',
		title: options.title,
		description: options.description,
		confirmText: options.confirmText || 'Confirm',
		cancelText: options.cancelText || 'Cancel',
		confirmClasses: options.confirmClasses || 'preset-filled-primary-500',
		cancelClasses: options.cancelClasses || 'preset-filled-surface-500',
		onConfirm: options.onConfirm,
		onCancel: options.onCancel
	});
}

/**
 * Show a delete confirmation dialog
 */
export function showDeleteDialog(options: {
	isArchive?: boolean;
	count?: number;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}): string {
	const { isArchive = false, count = 1, onConfirm, onCancel } = options;
	const entryText = count === 1 ? 'entry' : 'entries';
	const action = isArchive ? 'Archive' : 'Delete';
	const actionVerb = isArchive ? 'archive' : 'delete';

	return showConfirmDialog({
		title: `${action} ${count} ${entryText}?`,
		description: isArchive
			? `Are you sure you want to ${actionVerb} ${count} ${entryText}? Archived items can be restored later.`
			: `Are you sure you want to ${actionVerb} ${count} ${entryText}? This action cannot be undone.`,
		confirmText: action,
		confirmClasses: isArchive ? 'preset-filled-warning-500' : 'preset-filled-error-500',
		onConfirm,
		onCancel
	});
}

/**
 * Show a component dialog
 */
export function showComponentDialog(options: ComponentDialogOptions): string {
	return dialogState.open({
		type: 'component',
		component: options.component,
		componentProps: options.componentProps,
		title: options.title,
		description: options.description,
		meta: options.meta,
		onClose: options.onClose
	});
}

/**
 * Show an alert dialog (just OK button)
 */
export function showAlertDialog(options: { title: string; description: string; onClose?: () => void }): string {
	return dialogState.open({
		type: 'alert',
		title: options.title,
		description: options.description,
		confirmText: 'OK',
		onClose: options.onClose
	});
}

// Legacy compatibility layer (deprecated - use dialogState directly)
// These mimic the old Skeleton v2 ModalStore API for gradual migration

export interface LegacyModalSettings {
	type: 'alert' | 'confirm' | 'prompt' | 'component';
	title?: string;
	body?: string;
	buttonTextConfirm?: string;
	buttonTextCancel?: string;
	response?: (result: any) => void;
	component?: string;
	meta?: Record<string, any>;
}

class LegacyModalStore {
	trigger(settings: LegacyModalSettings): void {
		if (settings.type === 'confirm') {
			showConfirmDialog({
				title: settings.title || '',
				description: settings.body || '',
				confirmText: settings.buttonTextConfirm,
				cancelText: settings.buttonTextCancel,
				onConfirm: () => settings.response?.(true),
				onCancel: () => settings.response?.(false)
			});
		} else if (settings.type === 'alert') {
			showAlertDialog({
				title: settings.title || '',
				description: settings.body || '',
				onClose: () => settings.response?.(true)
			});
		} else if (settings.type === 'component') {
			// Component dialogs need the actual component, not just a string
			// This is a limitation of the legacy API - components should be migrated
			console.warn('[dialogState] Component modals require migration to new API');
			settings.response?.(false);
		}
	}

	close(): void {
		dialogState.closeTop();
	}

	clear(): void {
		dialogState.closeAll();
	}
}

/**
 * Legacy getModalStore replacement
 * @deprecated Use dialogState and showConfirmDialog directly
 */
export function getModalStore(): LegacyModalStore {
	console.warn('[dialogState] getModalStore is deprecated. Use dialogState and showConfirmDialog directly.');
	return new LegacyModalStore();
}
