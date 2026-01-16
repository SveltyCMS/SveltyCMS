/**
 * @file src/utils/modalState.svelte.ts
 * @description Modal state management
 *
 * ### Features
 * - Modal state management
 * - Modal component trigger
 * - Modal response handling
 *
 * ### Usage
 * <script>
 * 	import { modalState } from '$lib/utils/modalState';
 * </script>
 *
 * <ModalState />
 *
 * <button on:click={() => modalState.trigger(MyModal, { foo: 'bar' })}>Open Modal</button>
 *
 * <ModalState />
 *
 * ### Props
 * - component: Component to render
 * - props: Props to pass to the component
 * - response: Callback to handle response from the modal
 *
 * ### Events
 * - close: Emitted when the modal is closed
 */

import { type Component } from 'svelte';

export interface ModalStateItem {
	component: Component;
	props?: Record<string, any>;
	response?: (r: any) => void;
}

class ModalState {
	active = $state<ModalStateItem | null>(null);

	get isOpen() {
		return this.active !== null;
	}

	trigger(component: Component, props: Record<string, any> = {}, response?: (r: any) => void) {
		this.active = { component, props, response };
	}

	// Updated close to handle value passing
	close(value?: any) {
		if (this.active?.response && value !== undefined) {
			this.active.response(value);
		}
		this.active = null;
	}

	clear() {
		this.active = null;
	}
}

export const modalState = new ModalState();

// Backward compatibility for Skeleton v2 style calls
export function getModalStore() {
	return {
		trigger: (settings: any) => {
			// Support both direct component reference and v2 string references (if you have a map)
			const comp = settings.component?.ref || settings.component;
			modalState.trigger(comp, settings.props || {}, settings.response);
		},
		close: () => modalState.close(),
		clear: () => modalState.clear()
	};
}

// Helper function for confirmation dialogs
import ConfirmDialog from '@components/system/ConfirmDialog.svelte';

export function showConfirm(options: {
	title: string;
	body: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void | Promise<void>;
}) {
	modalState.trigger(
		ConfirmDialog,
		{
			title: options.title,
			body: options.body,
			buttonTextConfirm: options.confirmText,
			buttonTextCancel: options.cancelText
		},
		(confirmed: boolean) => {
			if (confirmed) {
				options.onConfirm();
			} else if (options.onCancel) {
				options.onCancel();
			}
		}
	);
}

// Helper function for schedule modal
import ScheduleModal from '@components/collectionDisplay/ScheduleModal.svelte';

export function showScheduleModal(options: { initialAction?: string; onSchedule: (date: Date, action: string) => void | Promise<void> }) {
	modalState.trigger(
		ScheduleModal,
		{
			initialAction: options.initialAction
		},
		(result: any) => {
			if (result?.confirmed && result.date) {
				options.onSchedule(result.date, result.action || options.initialAction || 'publish');
			}
		}
	);
}

// Helper function for clone modal
export function showCloneModal(options: { count: number; onConfirm: () => void | Promise<void> }) {
	showConfirm({
		title: 'Clone Items',
		body: `Are you sure you want to clone ${options.count} item(s)?`,
		confirmText: 'Clone',
		onConfirm: options.onConfirm
	});
}

export function showStatusChangeConfirm(options: { status: string; count: number; onConfirm: () => void | Promise<void> }) {
	showConfirm({
		title: 'Change Status',
		body: `Are you sure you want to change the status of ${options.count} item(s) to ${options.status}?`,
		confirmText: 'Change Status',
		onConfirm: options.onConfirm
	});
}

export function showDeleteConfirm(options: { isArchive: boolean; count: number; onConfirm: () => void | Promise<void> }) {
	showConfirm({
		title: options.isArchive ? 'Archive Items' : 'Delete Items',
		body: `Are you sure you want to ${options.isArchive ? 'archive' : 'delete'} ${options.count} item(s)?`,
		confirmText: options.isArchive ? 'Archive' : 'Delete',
		onConfirm: options.onConfirm
	});
}
