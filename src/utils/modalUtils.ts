/**
 * @file src/utils/modalUtils.ts
 * @description Centralized utility functions for creating consistent modal configurations
 */

import { modalState, showConfirm as _showConfirm } from '@utils/modalState.svelte';
import * as m from '@src/paraglide/messages';

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

/**
 * Backward compatibility: formerly used to set global store in layout.
 */
export function setGlobalModalStore(_store?: any): void {
	// No-op in v4
}

/**
 * Triggers a modal using the custom modalState
 */
export function showModal(settings: any): void {
	const comp = settings.component?.ref || settings.component;
	modalState.trigger(comp, settings.props || settings.meta || {}, settings.response);
}

/**
 * Standardized confirmation modal
 */
export function showConfirm(options: ConfirmModalOptions): void {
	_showConfirm({
		title: options.title,
		body: options.body,
		confirmText: options.confirmText || m.button_confirm?.() || 'Confirm',
		cancelText: options.cancelText || m.button_cancel?.() || 'Cancel',
		onConfirm: options.onConfirm || (() => {}),
		onCancel: options.onCancel || (() => {})
	});
}

/**
 * Delete confirmation modal
 */
export function showDeleteConfirm(options: {
	isArchive?: boolean;
	count?: number;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}): void {
	const { isArchive = false, count = 1, onConfirm, onCancel } = options;
	const action = isArchive ? 'Archive' : 'Delete';
	const actionColor = isArchive ? 'warning' : 'error';

	showConfirm({
		title: `Please Confirm <span class="text-${actionColor}-500 font-bold">${action}</span>`,
		body: `Are you sure you want to ${action.toLowerCase()} ${count} item(s)?`,
		confirmText: action,
		onConfirm,
		onCancel
	});
}

/**
 * Status change confirmation
 */
export function showStatusChangeConfirm(options: {
	status: string;
	count?: number;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
}): void {
	const { status, count = 1, onConfirm, onCancel } = options;
	showConfirm({
		title: 'Please Confirm Status Change',
		body: `Are you sure you want to change ${count} item(s) to ${status}?`,
		confirmText: 'Change Status',
		onConfirm,
		onCancel
	});
}

/**
 * Schedule modal
 */
import ScheduleModal from '@components/collectionDisplay/ScheduleModal.svelte';
export function showScheduleModal(options: { initialAction?: string; onSchedule: (date: Date, action: string) => void | Promise<void> }): void {
	modalState.trigger(ScheduleModal, { initialAction: options.initialAction }, (result: any) => {
		if (result?.confirmed && result.date) {
			options.onSchedule(result.date, result.action || options.initialAction || 'publish');
		}
	});
}

/**
 * Clone confirmation
 */
export function showCloneModal(options: { count?: number; onConfirm: () => void | Promise<void>; onCancel?: () => void }): void {
	const { count = 1, onConfirm, onCancel } = options;
	showConfirm({
		title: 'Clone Items',
		body: `Are you sure you want to clone ${count} item(s)?`,
		confirmText: 'Clone',
		onConfirm,
		onCancel
	});
}
