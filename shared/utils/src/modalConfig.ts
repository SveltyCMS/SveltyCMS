/**
 * @file src/utils/modalConfig.ts
 * @description Centralized modal configuration utility for consistent modal behavior
 *
 * Features:
 * - Standardized modal configurations
 * - Type-safe modal settings
 * - Consistent styling and behavior
 * - Localization support
 * - Action-specific modal templates
 */

// Local type definition for ModalSettings (was imported from skeleton v2)
export interface ModalSettings {
	type?: 'confirm' | 'component' | 'alert';
	title?: string;
	body?: string;
	buttonTextConfirm?: string;
	buttonTextCancel?: string;
	modalClasses?: string;
	backdropClasses?: string;
	meta?: Record<string, unknown>;
	response?: (r: boolean) => void;
	component?: {
		ref: string;
		props?: Record<string, unknown>;
	};
}

import { showToast } from '@shared/utils/toast';
import { writable } from 'svelte/store';

// ParaglideJS
import * as m from '@shared/paraglide/messages';

// Modal themes and configurations
export interface ModalTheme {
	preset: 'filled' | 'ghost' | 'soft' | 'glass';
	color: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
}

export interface ActionModalConfig {
	title: string;
	body: string;
	confirmText?: string;
	cancelText?: string;
	theme?: ModalTheme;
	icon?: string;
	showIcon?: boolean;
}

// Default themes for different actions
export const DEFAULT_THEMES: Record<string, ModalTheme> = {
	delete: { preset: 'filled', color: 'error' },
	archive: { preset: 'filled', color: 'warning' },
	publish: { preset: 'filled', color: 'success' },
	unpublish: { preset: 'filled', color: 'warning' },
	clone: { preset: 'filled', color: 'primary' },
	schedule: { preset: 'filled', color: 'tertiary' },
	default: { preset: 'filled', color: 'primary' }
};

// Store for managing modal state
export const modalConfigStore = writable<ModalSettings | null>(null);

// Creates a standardized confirmation modal
export function createConfirmModal(config: ActionModalConfig, onConfirm: () => void, onCancel?: () => void): ModalSettings {
	const theme = config.theme || DEFAULT_THEMES.default;

	return {
		type: 'confirm',
		title: config.title,
		body: config.body,
		buttonTextConfirm: config.confirmText || m.button_confirm(),
		buttonTextCancel: config.cancelText || m.button_cancel(),

		// Styling
		modalClasses: `!bg-${theme.color}-500/10 !border-${theme.color}-500/20`,
		backdropClasses: 'bg-surface-500/50!',

		// Enhanced styling for buttons (use `meta` as expected by ModalSettings)
		meta: {
			buttonConfirmClasses: `preset-${theme.preset}-${theme.color}-500`,
			buttonCancelClasses: 'preset-outlined-surface-500'
		},

		response: (confirmed: boolean) => {
			if (confirmed && onConfirm) {
				onConfirm();
			} else if (!confirmed && onCancel) {
				onCancel();
			}
		}
	};
}

// Creates a deletion confirmation modal with enhanced warnings
export function createDeleteModal(itemType: string, itemName: string | string[], onConfirm: () => void, isAdmin = false): ModalSettings {
	const isBatch = Array.isArray(itemName);
	const count = isBatch ? itemName.length : 1;

	const title = count > 1 ? `Delete ${count} ${itemType}` : `Delete ${itemType}`;

	const body =
		count > 1
			? `Are you sure you want to delete ${count} ${itemType}? This action cannot be undone.`
			: `Are you sure you want to delete ${itemName ?? 'this item'}? This action cannot be undone.`;

	// Enhanced warning for admins
	const warning = isAdmin
		? `<div class="alert preset-filled-warning-500 mt-4">
			<i class="fa-solid fa-triangle-exclamation"></i>
			<div>
				<h3>Important</h3>
				<p>This action is irreversible and may affect related data.</p>
			</div>
		   </div>`
		: '';

	return createConfirmModal(
		{
			title,
			body: body + warning,
			confirmText: m.button_confirm?.() || 'Confirm',
			cancelText: m.button_cancel?.() || 'Cancel',
			theme: DEFAULT_THEMES.delete,
			icon: 'fa-trash',
			showIcon: true
		},
		onConfirm
	);
}

// Creates an archive confirmation modal
export function createArchiveModal(itemType: string, itemName: string | string[], onConfirm: () => void): ModalSettings {
	const isBatch = Array.isArray(itemName);
	const count = isBatch ? itemName.length : 1;

	const title = count > 1 ? `Archive ${count} ${itemType}` : `Archive ${itemType}`;

	const body =
		count > 1
			? `Are you sure you want to archive ${count} ${itemType}? You can restore archived items later.`
			: `Are you sure you want to archive ${itemName ?? 'this item'}? You can restore archived items later.`;

	return createConfirmModal(
		{
			title,
			body,
			confirmText: m.button_confirm?.() || 'Confirm',
			cancelText: m.button_cancel?.() || 'Cancel',
			theme: DEFAULT_THEMES.archive,
			icon: 'fa-archive',
			showIcon: true
		},
		onConfirm
	);
}

// Creates a status change confirmation modal
export function createStatusModal(fromStatus: string, toStatus: string, itemType: string, itemName: string, onConfirm: () => void): ModalSettings {
	const title = `Change status from ${fromStatus} to ${toStatus}`;
	const body = `Change ${itemName ?? 'this item'} (${itemType}) status to ${toStatus}?`;

	return createConfirmModal(
		{
			title,
			body,
			confirmText: m.button_confirm(),
			cancelText: m.button_cancel(),
			theme: DEFAULT_THEMES[toStatus] || DEFAULT_THEMES.default,
			icon: getStatusIcon(toStatus),
			showIcon: true
		},
		onConfirm
	);
}

// Creates a scheduling confirmation modal with date picker
export function createScheduleModal(itemType: string, itemName: string, onConfirm: (scheduledDate: Date) => void): ModalSettings {
	return {
		type: 'component',
		title: m.scheduler_title?.({ type: itemType }) || 'Schedule Publication',
		body: m.scheduler_body?.({ name: itemName }) || 'Set a date and time to publish this entry.',
		component: {
			ref: 'DatePickerModal',
			props: {
				itemName,
				onConfirm: (date: Date) => onConfirm(date),
				theme: DEFAULT_THEMES.schedule
			}
		},
		buttonTextCancel: m.button_cancel(),
		modalClasses: 'bg-tertiary-500/10! border-tertiary-500/20!'
	};
}

// Creates a batch operation selection modal
export function createBatchModal(
	selectedCount: number,
	itemType: string,
	availableActions: string[],
	onAction: (action: string) => void
): ModalSettings {
	const messages = m as unknown as Record<string, ((args?: Record<string, unknown>) => string) | undefined>;
	return {
		type: 'component',
		title: messages.batch_title?.({ count: selectedCount, type: itemType }) || `Batch Actions (${selectedCount})`,
		body: messages.batch_body?.() || 'Select an action to perform on the selected items.',
		component: {
			ref: 'BatchActionModal',
			props: {
				selectedCount,
				itemType,
				availableActions,
				onAction
			}
		},
		buttonTextCancel: m.button_cancel(),
		modalClasses: 'bg-primary-500/10! border-primary-500/20!'
	};
}

// Helper function to get status-specific icons
function getStatusIcon(status: string): string {
	const iconMap: Record<string, string> = {
		published: 'fa-check-circle',
		unpublished: 'fa-eye-slash',
		draft: 'fa-edit',
		archive: 'fa-archive',
		delete: 'fa-trash',
		schedule: 'fa-calendar',
		pending: 'fa-clock'
	};

	return iconMap[status] || 'fa-info-circle';
}

// Utility to show success toast after modal actions
export function showActionToast(action: string, itemType: string, count = 1, success = true) {
	// Map common actions to existing message keys exported by Paraglide
	const mapping: Record<string, { single: string; batch?: string } | undefined> = {
		delete: { single: 'entry_deleted_success', batch: 'entries_deleted' },
		archive: { single: 'entry_archived', batch: 'entries_archived' },
		publish: { single: 'entry_saved', batch: 'entries_published' },
		unpublish: { single: 'entry_unpublished', batch: 'entries_unpublished' },
		schedule: { single: 'entry_scheduled', batch: 'entries_scheduled' },
		clone: { single: 'entry_cloned_success', batch: 'entries_cloned' },
		save: { single: 'entry_saved', batch: 'entries_updated' },
		update: { single: 'entry_saved', batch: 'entries_updated' }
	};

	const mapped = mapping[action];
	const key = mapped ? (count > 1 && mapped.batch ? mapped.batch : mapped.single) : undefined;

	const type = success ? 'success' : ('error' as const);

	let message: string;

	if (key) {
		// Try to call the generated message function if available
		// Paraglide exports functions named after the keys (underscores)
		const fn = (m as Record<string, unknown>)[key];
		if (typeof fn === 'function') {
			try {
				message = fn({ count, type: itemType }) as string;
			} catch {
				message = count > 1 ? `${count} ${itemType} ${action}ed.` : `${itemType} ${action}ed.`;
			}
		} else {
			// Fallback to raw string in messages file via known keys from en.json
			// As a last resort, use a simple templated message
			message = count > 1 ? `${count} ${itemType} ${action}ed.` : `${itemType} ${action}ed.`;
		}
	} else {
		message = count > 1 ? `${count} ${itemType} ${action}ed.` : `${itemType} ${action}ed.`;
	}

	showToast(message, type);
}

// Validates if an action is available for current user permissions
export function isActionAllowed(action: string, userRole: string, isAdmin: boolean): boolean {
	const adminOnlyActions = ['delete'];
	const editorActions = ['publish', 'unpublish', 'archive', 'schedule'];

	if (adminOnlyActions.includes(action) && !isAdmin) {
		return false;
	}

	if (editorActions.includes(action) && !['admin', 'editor'].includes(userRole)) {
		return false;
	}

	return true;
}
