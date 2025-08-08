/**
 * @file src/utils/modalUtils.ts
 * @description Centralized utility functions for creating consistent modal configurations
 */

import type { ModalSettings } from '@skeletonlabs/skeleton';
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

export interface ScheduleModalOptions {
	initialAction?: 'publish' | 'unpublish' | 'delete';
	onSchedule?: (date: Date, action: string) => void | Promise<void>;
}

/**
 * Creates a standardized confirmation modal configuration
 */
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

/**
 * Creates a delete confirmation modal
 */
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

/**
 * Creates a status change confirmation modal
 */
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

/**
 * Creates a schedule modal configuration using the existing ScheduleModal component
 */
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

/**
 * Creates a clone confirmation modal
 */
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
