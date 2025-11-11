/**
 * @file skeleton-compat.ts
 * @description Compatibility layer for Skeleton v4 migration
 * Provides stub implementations of Modal and Toast stores until full migration
 */

import { writable, type Writable } from 'svelte/store';

// Modal types
export interface ModalSettings {
	type?: 'alert' | 'confirm' | 'prompt' | 'component';
	title?: string;
	body?: string;
	image?: string;
	component?: string;
	meta?: any;
	response?: (r: any) => void;
	buttonTextCancel?: string;
	buttonTextConfirm?: string;
	buttonTextSubmit?: string;
	value?: string;
}

export interface ModalStore extends Writable<ModalSettings[]> {
	/** Append to end of queue */
	trigger: (modal: ModalSettings) => void;
	/**  Remove first item in queue */
	close: () => void;
	/** Remove all items from queue */
	clear: () => void;
}

// Toast types
export interface ToastSettings {
	message: string;
	autohide?: boolean;
	timeout?: number;
	hoverable?: boolean;
	background?: string;
	classes?: string;
	action?: {
		label: string;
		response: () => void;
	};
}

export interface ToastStore extends Writable<ToastSettings[]> {
	/** Add a new toast to the queue. */
	trigger: (toast: ToastSettings) => void;
	/** Removes first toast in queue */
	close: (id: string) => void;
	/** Remove all toasts from queue */
	clear: () => void;
}

// Create stores
function createModalStore(): ModalStore {
	const { subscribe, set, update } = writable<ModalSettings[]>([]);
	
	return {
		subscribe,
		set,
		update,
		trigger: (modal: ModalSettings) => {
			update((modals) => [...modals, modal]);
		},
		close: () => {
			update((modals) => {
				const [, ...rest] = modals;
				return rest;
			});
		},
		clear: () => {
			set([]);
		}
	};
}

function createToastStore(): ToastStore {
	const { subscribe, set, update } = writable<ToastSettings[]>([]);
	
	return {
		subscribe,
		set,
		update,
		trigger: (toast: ToastSettings) => {
			update((toasts) => [...toasts, toast]);
			if (toast.autohide !== false) {
				setTimeout(() => {
					update((toasts) => toasts.slice(1));
				}, toast.timeout || 3000);
			}
		},
		close: (id: string) => {
			update((toasts) => toasts.slice(1));
		},
		clear: () => {
			set([]);
		}
	};
}

// Singleton instances
let modalStore: ModalStore | undefined;
let toastStore: ToastStore | undefined;

export function getModalStore(): ModalStore {
	if (!modalStore) {
		modalStore = createModalStore();
	}
	return modalStore;
}

export function getToastStore(): ToastStore {
	if (!toastStore) {
		toastStore = createToastStore();
	}
	return toastStore;
}

// Re-export types
export type { ModalSettings as ModalComponent };

// Popup store for Floating UI integration
export const storePopup = writable({});

// Mode store (light/dark)
export const modeCurrent = writable(false);
export const modeUserPrefers = writable(false);
export const modeOsPrefers = writable(false);

// Initialize stores function (no-op in v4, stores are created on demand)
export function initializeStores() {
	// In Skeleton v4, this is a no-op as stores are auto-initialized
	return;
}

// Mode management functions
export function setModeCurrent(value: boolean) {
	modeCurrent.set(value);
	if (value) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
}

export function setModeUserPrefers(value: boolean) {
	modeUserPrefers.set(value);
}

export function setModeOsPrefers(value: boolean) {
	modeOsPrefers.set(value);
}

export function getModeOsPrefers(): boolean {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getModeUserPrefers(): boolean {
	let value = false;
	modeUserPrefers.subscribe((v) => value = v)();
	return value;
}

export function getModeAutoPrefers(): boolean {
	return getModeOsPrefers();
}

export function setInitialClassState() {
	// Set initial dark mode class
	const isDark = getModeOsPrefers();
	setModeCurrent(isDark);
}

// Popup action for Floating UI
export function popup(node: HTMLElement, args: any) {
	// Placeholder popup action
	return {
		update(newArgs: any) {},
		destroy() {}
	};
}

// Clipboard utility
export const clipboard = {
	copy: async (text: string) => {
		await navigator.clipboard.writeText(text);
	}
};

// Component placeholders - these need proper Svelte component implementations
// For now, export empty objects to make TypeScript happy
export { default as Modal } from './skeleton-components/Modal.svelte';
export { default as Toast } from './skeleton-components/Toast.svelte';
export { default as ProgressBar } from './skeleton-components/ProgressBar.svelte';
export { default as Avatar } from './skeleton-components/Avatar.svelte';
export { default as Tab } from './skeleton-components/Tab.svelte';
export { default as TabGroup } from './skeleton-components/TabGroup.svelte';
export { default as CodeBlock } from './skeleton-components/CodeBlock.svelte';
export { default as RangeSlider } from './skeleton-components/RangeSlider.svelte';
export { default as ListBox } from './skeleton-components/ListBox.svelte';
export { default as ListBoxItem } from './skeleton-components/ListBoxItem.svelte';
export { default as FileDropzone } from './skeleton-components/FileDropzone.svelte';
export { default as Ratings } from './skeleton-components/Ratings.svelte';

export type PopupSettings = any;
