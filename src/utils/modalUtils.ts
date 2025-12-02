/**
 * @file src/utils/modalUtils.ts
 * @description Centralized utility functions for creating consistent modal configurations
 *
 * Features:
 * - Standardized confirmation modals (confirm, delete, status change, clone)
 * - Schedule modal configuration
 * - Global modal store management
 *
 * Updated for Skeleton v4 - uses dialogState internally
 */

import {
	dialogState,
	showConfirmDialog,
	showDeleteDialog,
	showComponentDialog,
	type ConfirmDialogOptions
} from './dialogState.svelte';
// ParaglideJS
import * as m from '@src/paraglide/messages';
import { logger } from './logger';

export interface ConfirmModalOptions {
	title: string;
	body: string;
	confirmText?: string;
	cancelText?: string;
	confirmClasses?: string;
	cancelClasses?: string;
	onConfirm?: () => void | Promise<void>;
	onCancel?: () => void;
}

export interface ScheduleModalOptions {
	initialAction?: 'publish' | 'unpublish' | 'delete';
	onSchedule?: (date: Date, action: string) => void | Promise<void>;
}

// Legacy modal settings type for backward compatibility
export interface ModalSettings {
	type: 'alert' | 'confirm' | 'prompt' | 'component';
	title?: string;
	body?: string;
	buttonTextConfirm?: string;
	buttonTextCancel?: string;
	response?: (result: any) => void;
	component?: string | ModalComponent;
	meta?: Record<string, any>;
	modalClasses?: string;
	backdropClasses?: string;
}

// Legacy modal store type for backward compatibility
export interface ModalStore {
	trigger: (settings: ModalSettings) => void;
	close: () => void;
	clear: () => void;
}

// Legacy ModalComponent type for backward compatibility
export interface ModalComponent {
	ref: any;
	props?: Record<string, unknown>;
	slot?: string;
}

/**
 * Legacy getModalStore replacement
 * @deprecated Use showConfirmDialog or dialogState directly
 */
export function getModalStore(): ModalStore {
	if (!modalStoreRef) {
		setGlobalModalStore();
	}
	return modalStoreRef!;
}

// Global modal store reference (legacy compatibility)
let modalStoreRef: ModalStore | null = null;

/**
 * Initialize the global modal store reference
 * @deprecated Use dialogState directly for new code
 */
export function setGlobalModalStore(store?: ModalStore): void {
	// Create a legacy-compatible store wrapper
	modalStoreRef = store ?? {
		trigger: (settings: ModalSettings) => {
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
				dialogState.open({
					type: 'alert',
					title: settings.title,
					description: settings.body,
					confirmText: 'OK',
					onClose: () => settings.response?.(true)
				});
			} else if (settings.type === 'component') {
				logger.warn('[modalUtils] Component modals need migration to showComponentDialog()');
				settings.response?.(false);
			}
		},
		close: () => dialogState.closeTop(),
		clear: () => dialogState.closeAll()
	};
}

/**
 * Triggers a modal using the initialized global modal store
 * @deprecated Use showConfirmDialog or showComponentDialog directly
 */
export function showModal(settings: ModalSettings): void {
	if (!modalStoreRef) {
		// Auto-initialize if not already done
		setGlobalModalStore();
	}

	modalStoreRef!.trigger(settings);
}

// Creates a standardized confirmation modal configuration
export function createConfirmModal(options: ConfirmModalOptions): ModalSettings {
	return {
		type: 'confirm',
		title: options.title,
		body: options.body,
		buttonTextConfirm: options.confirmText || m.button_confirm?.() || 'Confirm',
		buttonTextCancel: options.cancelText || m.button_cancel?.() || 'Cancel',
		meta: {
			buttonConfirmClasses: options.confirmClasses || 'bg-primary-500 hover:bg-primary-600 text-white',
			buttonCancelClasses: options.cancelClasses || 'bg-surface-500 hover:bg-surface-600 text-white'
		},
		response: async (confirmed: boolean) => {
			if (confirmed && options.onConfirm) {
				await options.onConfirm();
			} else if (!confirmed && options.onCancel) {
				options.onCancel();
			}
		}
	};
}

// Convenience: open a confirm modal using the global store
export function showConfirm(options: ConfirmModalOptions): void {
	showModal(createConfirmModal(options));
}

// Creates a delete confirmation modal
export function createDeleteModal(options: {
	isArchive?: boolean;
	count?: number;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}): ModalSettings {
	const { isArchive = false, count = 1, onConfirm, onCancel } = options;
	const entryText = count === 1 ? 'entry' : 'entries';
	const action = isArchive ? 'Archive' : 'Delete';
	const actionVerb = isArchive ? 'archive' : 'delete';
	const actionColor = isArchive ? 'warning' : 'error';

	return createConfirmModal({
		title: `Please Confirm <span class="text-${actionColor}-500 font-bold">${action}</span>`,
		body: isArchive
			? `Are you sure you want to <span class="text-${actionColor}-500 font-semibold">${actionVerb}</span> ${count} ${entryText}? Archived items can be restored later.`
			: `Are you sure you want to <span class="text-${actionColor}-500 font-semibold">${actionVerb}</span> ${count} ${entryText}? This action will remove ${count === 1 ? 'it' : 'them'} from the system.`,
		confirmText: action,
		confirmClasses: `bg-${actionColor}-500 hover:bg-${actionColor}-600 text-white`,
		onConfirm,
		onCancel
	});
}

// Convenience: open a delete/archive confirm modal using the global store
export function showDeleteConfirm(options: {
	isArchive?: boolean;
	count?: number;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}): void {
	showModal(createDeleteModal(options));
}

// Creates a status change confirmation modal
export function createStatusChangeModal(options: {
	status: string;
	count?: number;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}): ModalSettings {
	const { status, count = 1, onConfirm, onCancel } = options;
	const entryText = count === 1 ? 'entry' : 'entries';

	const getStatusInfo = (status: string) => {
		switch (status.toLowerCase()) {
			case 'publish':
				return { color: 'primary', name: 'Publication' };
			case 'unpublish':
				return { color: 'yellow', name: 'Unpublication' };
			case 'test':
				return { color: 'secondary', name: 'Testing' };
			case 'schedule':
				return { color: 'pink', name: 'Scheduling' };
			default:
				return { color: 'primary', name: 'Status Change' };
		}
	};

	const statusInfo = getStatusInfo(status);

	return createConfirmModal({
		title: `Please Confirm <span class="text-${statusInfo.color}-500 font-bold">${statusInfo.name}</span>`,
		body: `Are you sure you want to <span class="text-${statusInfo.color}-500 font-semibold">change</span> ${count} ${entryText} status to <span class="text-${statusInfo.color}-500 font-semibold">${status}</span>?`,
		confirmText: status.charAt(0).toUpperCase() + status.slice(1),
		confirmClasses: `bg-${statusInfo.color}-500 hover:bg-${statusInfo.color}-600 text-white`,
		onConfirm,
		onCancel
	});
}

// Convenience: open a status change confirm modal using the global store
export function showStatusChangeConfirm(options: {
	status: string;
	count?: number;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}): void {
	showModal(createStatusChangeModal(options));
}

// Creates a schedule modal configuration using the existing ScheduleModal component
export function createScheduleModal(options: ScheduleModalOptions = {}): ModalSettings {
	return {
		type: 'component',
		component: 'scheduleModal',
		title: 'Schedule Entry',
		meta: {
			initialAction: options.initialAction || 'publish'
		},
		response: (result: { date: Date; action: string } | boolean) => {
			if (result && typeof result === 'object' && 'date' in result && options.onSchedule) {
				options.onSchedule(result.date, result.action);
			}
		}
	};
}

// Convenience: open a schedule modal using the global store
export function showScheduleModal(options: ScheduleModalOptions = {}): void {
	logger.debug('showScheduleModal called with options:', options);
	const modalSettings = createScheduleModal(options);
	logger.debug('Created modal settings:', modalSettings);
	showModal(modalSettings);
}

// Creates a clone confirmation modal
export function createCloneModal(options: { count?: number; onConfirm: () => void | Promise<void>; onCancel?: () => void }): ModalSettings {
	const { count = 1, onConfirm, onCancel } = options;
	const entryText = count === 1 ? 'entry' : 'entries';

	return createConfirmModal({
		title: m.entrylist_multibutton_clone?.() || 'Clone Entries',
		body:
			m.clone_entry_body?.() ||
			`Are you sure you want to clone ${count} ${entryText}? This will create ${count === 1 ? 'a duplicate' : 'duplicates'} of the selected ${entryText}.`,
		confirmText: m.entrylist_multibutton_clone?.() || 'Clone',
		confirmClasses: 'bg-secondary-500 hover:bg-secondary-600 text-white',
		onConfirm,
		onCancel
	});
}

// Convenience: open a clone confirm modal using the global store
export function showCloneModal(options: { count?: number; onConfirm: () => void | Promise<void>; onCancel?: () => void }): void {
	showModal(createCloneModal(options));
}
