/**
 * @file src/utils/modalUtils.ts
 * @description Centralized utility functions for creating consistent modal configurations
 */

import { modalState } from '@utils/modalState.svelte';
import * as m from '@src/paraglide/messages';

// Dialog Components
import ConfirmDialog from '@components/system/ConfirmDialog.svelte';
import ScheduleModal from '@components/collectionDisplay/ScheduleModal.svelte';

export interface ConfirmModalOptions {
	title: string;
	body: string;
	confirmText?: string;
	/** Alias for confirmText */
	buttonTextConfirm?: string;
	cancelText?: string;
	onConfirm?: () => void | Promise<void>;
	onCancel?: () => void;
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
	modalState.trigger(
		ConfirmDialog,
		{
			htmlTitle: options.title,
			body: options.body,
			buttonTextConfirm: options.buttonTextConfirm || options.confirmText || m.button_confirm?.() || 'Confirm',
			buttonTextCancel: options.cancelText || m.button_cancel?.() || 'Cancel'
		},
		(confirmed: boolean) => {
			if (confirmed) {
				options.onConfirm?.();
			} else {
				options.onCancel?.();
			}
		}
	);
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

	showConfirm({
		title: `Confirm ${action}`,
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
		title: 'Confirm Status Change',
		body: `Are you sure you want to change ${count} item(s) to ${status}?`,
		confirmText: 'Change Status',
		onConfirm,
		onCancel
	});
}

/**
 * Schedule modal
 */
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
