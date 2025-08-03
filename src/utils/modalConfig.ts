/**
 * @file src/utils/modalConfig.ts
 * @description Centralized modal configuration utility for consistent modal behavior
 *
 * Features:
 * * Standardized modal configurations
 * * Type-safe modal settings
 * * Consistent styling and behavior
 * * Localization support
 * * Action-specific modal templates
 */

import { writable } from 'svelte/store';
import type { ModalSettings } from '@skeletonlabs/skeleton';
import { toastStore } from '@skeletonlabs/skeleton';
import { currentLanguage } from '@src/messages/store';
import { m } from '@src/messages/messages';

// Modal themes and configurations
export interface ModalTheme {
	variant: 'filled' | 'ghost' | 'soft' | 'glass';
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
	delete: { variant: 'filled', color: 'error' },
	archive: { variant: 'filled', color: 'warning' },
	publish: { variant: 'filled', color: 'success' },
	unpublish: { variant: 'filled', color: 'warning' },
	clone: { variant: 'filled', color: 'primary' },
	schedule: { variant: 'filled', color: 'tertiary' },
	default: { variant: 'filled', color: 'primary' }
};

// Store for managing modal state
export const modalConfigStore = writable<ModalSettings | null>(null);

/**
 * Creates a standardized confirmation modal
 */
export function createConfirmModal(config: ActionModalConfig, onConfirm: () => void, onCancel?: () => void): ModalSettings {
	const theme = config.theme || DEFAULT_THEMES.default;

	return {
		type: 'confirm',
		title: config.title,
		body: config.body,
		buttonTextConfirm: config.confirmText || m.get('common.confirm'),
		buttonTextCancel: config.cancelText || m.get('common.cancel'),

		// Styling
		modalClasses: `!bg-${theme.color}-500/10 !border-${theme.color}-500/20`,
		backdropClasses: '!bg-surface-500/50',

		// Enhanced styling for buttons
		buttonPositive: `variant-${theme.variant}-${theme.color}`,
		buttonNeutral: 'variant-ghost-surface',

		response: (confirmed: boolean) => {
			if (confirmed && onConfirm) {
				onConfirm();
			} else if (!confirmed && onCancel) {
				onCancel();
			}
		}
	};
}

/**
 * Creates a deletion confirmation modal with enhanced warnings
 */
export function createDeleteModal(itemType: string, itemName: string, onConfirm: () => void, isAdmin = false): ModalSettings {
	const isBatch = typeof itemName === 'object';
	const count = isBatch ? (itemName as any).length : 1;

	const title = count > 1 ? m.get('modal.delete.title.batch', { count, type: itemType }) : m.get('modal.delete.title.single', { type: itemType });

	const body =
		count > 1 ? m.get('modal.delete.body.batch', { count, type: itemType }) : m.get('modal.delete.body.single', { name: itemName, type: itemType });

	// Enhanced warning for admins
	const warning = isAdmin
		? `<div class="alert variant-filled-warning mt-4">
			<i class="fa-solid fa-triangle-exclamation"></i>
			<div>
				<h3>${m.get('modal.delete.warning.title')}</h3>
				<p>${m.get('modal.delete.warning.message')}</p>
			</div>
		   </div>`
		: '';

	return createConfirmModal(
		{
			title,
			body: body + warning,
			confirmText: m.get('modal.delete.confirm'),
			cancelText: m.get('common.cancel'),
			theme: DEFAULT_THEMES.delete,
			icon: 'fa-trash',
			showIcon: true
		},
		onConfirm
	);
}

/**
 * Creates an archive confirmation modal
 */
export function createArchiveModal(itemType: string, itemName: string, onConfirm: () => void): ModalSettings {
	const isBatch = typeof itemName === 'object';
	const count = isBatch ? (itemName as any).length : 1;

	const title = count > 1 ? m.get('modal.archive.title.batch', { count, type: itemType }) : m.get('modal.archive.title.single', { type: itemType });

	const body =
		count > 1 ? m.get('modal.archive.body.batch', { count, type: itemType }) : m.get('modal.archive.body.single', { name: itemName, type: itemType });

	return createConfirmModal(
		{
			title,
			body,
			confirmText: m.get('modal.archive.confirm'),
			cancelText: m.get('common.cancel'),
			theme: DEFAULT_THEMES.archive,
			icon: 'fa-archive',
			showIcon: true
		},
		onConfirm
	);
}

/**
 * Creates a status change confirmation modal
 */
export function createStatusModal(fromStatus: string, toStatus: string, itemType: string, itemName: string, onConfirm: () => void): ModalSettings {
	const title = m.get('modal.status.title', { from: fromStatus, to: toStatus });
	const body = m.get('modal.status.body', { name: itemName, type: itemType, status: toStatus });

	return createConfirmModal(
		{
			title,
			body,
			confirmText: m.get('modal.status.confirm', { status: toStatus }),
			cancelText: m.get('common.cancel'),
			theme: DEFAULT_THEMES[toStatus] || DEFAULT_THEMES.default,
			icon: getStatusIcon(toStatus),
			showIcon: true
		},
		onConfirm
	);
}

/**
 * Creates a scheduling confirmation modal with date picker
 */
export function createScheduleModal(itemType: string, itemName: string, onConfirm: (scheduledDate: Date) => void): ModalSettings {
	return {
		type: 'component',
		title: m.get('modal.schedule.title', { type: itemType }),
		body: m.get('modal.schedule.body', { name: itemName }),
		component: {
			ref: 'DatePickerModal',
			props: {
				itemName,
				onConfirm: (date: Date) => onConfirm(date),
				theme: DEFAULT_THEMES.schedule
			}
		},
		buttonTextCancel: m.get('common.cancel'),
		modalClasses: '!bg-tertiary-500/10 !border-tertiary-500/20'
	};
}

/**
 * Creates a batch operation selection modal
 */
export function createBatchModal(
	selectedCount: number,
	itemType: string,
	availableActions: string[],
	onAction: (action: string) => void
): ModalSettings {
	return {
		type: 'component',
		title: m.get('modal.batch.title', { count: selectedCount, type: itemType }),
		body: m.get('modal.batch.body'),
		component: {
			ref: 'BatchActionModal',
			props: {
				selectedCount,
				itemType,
				availableActions,
				onAction
			}
		},
		buttonTextCancel: m.get('common.cancel'),
		modalClasses: '!bg-primary-500/10 !border-primary-500/20'
	};
}

/**
 * Helper function to get status-specific icons
 */
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

/**
 * Utility to show success toast after modal actions
 */
export function showActionToast(action: string, itemType: string, count = 1, success = true) {
	const messageKey = success ? `toast.${action}.success${count > 1 ? '.batch' : ''}` : `toast.${action}.error${count > 1 ? '.batch' : ''}`;

	const background = success ? 'variant-filled-success' : 'variant-filled-error';

	toastStore.trigger({
		message: m.get(messageKey, { count, type: itemType }),
		background,
		timeout: success ? 3000 : 5000,
		hideDismiss: false
	});
}

/**
 * Validates if an action is available for current user permissions
 */
export function isActionAllowed(action: string, userRole: string, isAdmin: boolean): boolean {
	const adminOnlyActions = ['delete', 'batch-delete'];
	const editorActions = ['publish', 'unpublish', 'archive', 'schedule'];

	if (adminOnlyActions.includes(action) && !isAdmin) {
		return false;
	}

	if (editorActions.includes(action) && !['admin', 'editor'].includes(userRole)) {
		return false;
	}

	return true;
}
