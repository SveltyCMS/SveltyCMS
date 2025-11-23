/**
 * Skeleton v2 to v4 Compatibility Shim
 * This provides backwards compatibility for utilities and stores
 * while we migrate to new Skeleton v4 patterns
 */

import { writable, derived } from 'svelte/store';

// Re-export actual Skeleton v4 components
export { Toast, createToaster } from '@skeletonlabs/skeleton-svelte';
export { Avatar } from '@skeletonlabs/skeleton-svelte';
export { Dialog } from '@skeletonlabs/skeleton-svelte';
export { Tabs } from '@skeletonlabs/skeleton-svelte';
export { Progress as ProgressBar } from '@skeletonlabs/skeleton-svelte';
export { Slider as RangeSlider } from '@skeletonlabs/skeleton-svelte';
export { Popover } from '@skeletonlabs/skeleton-svelte';
export { RatingGroup as Ratings } from '@skeletonlabs/skeleton-svelte';
export { Listbox as ListBox } from '@skeletonlabs/skeleton-svelte';
export { FileUpload as FileDropzone } from '@skeletonlabs/skeleton-svelte';

// Compatibility aliases for v2 patterns
export const TabGroup = Tabs;
export const Tab = Tabs;
export const ListBoxItem = Listbox;

// Modal Store interfaces and implementation
export interface ModalSettings {
	type?: 'alert' | 'confirm' | 'prompt' | 'component';
	title?: string;
	body?: string;
	image?: string;
	component?: any;
	meta?: any;
	response?: (r: any) => void;
	buttonTextCancel?: string;
	buttonTextConfirm?: string;
	buttonTextSubmit?: string;
	value?: any;
}

export interface ModalComponent {
	ref: any;
	props?: any;
	slot?: string;
}

export interface ModalStore {
	trigger: (modal: ModalSettings) => void;
	close: () => void;
	clear: () => void;
	subscribe: any;
}

function createModalStore(): ModalStore {
	const { subscribe, set, update } = writable<ModalSettings[]>([]);

	return {
		subscribe,
		trigger: (modal: ModalSettings) => {
			update((modals) => [...modals, modal]);
		},
		close: () => {
			update((modals) => {
				const newModals = [...modals];
				newModals.pop();
				return newModals;
			});
		},
		clear: () => {
			set([]);
		}
	};
}

let modalStoreInstance: ModalStore | null = null;

export function getModalStore(): ModalStore {
	if (!modalStoreInstance) {
		modalStoreInstance = createModalStore();
	}
	return modalStoreInstance;
}

// Toast Store compatibility (use createToaster instead)
export interface ToastStore {
	trigger: (toast: any) => void;
	close: (id?: string) => void;
	clear: () => void;
	subscribe: any;
}

let toastStoreInstance: ToastStore | null = null;

export function getToastStore(): ToastStore {
	if (!toastStoreInstance) {
		const { subscribe, set, update } = writable<any[]>([]);
		toastStoreInstance = {
			subscribe,
			trigger: (toast: any) => {
				// For now, just add to array, actual display would need Dialog component
				update((toasts) => [...toasts, toast]);
			},
			close: (id?: string) => {
				update((toasts) => toasts.slice(0, -1));
			},
			clear: () => {
				set([]);
			}
		};
	}
	return toastStoreInstance;
}

// Popup compatibility
export interface PopupSettings {
	event?: string;
	target?: string;
	placement?: string;
	middleware?: any;
}

export function popup(settings: PopupSettings = {}) {
	return {
		destroy() {}
	};
}

// Store popup for Floating UI configuration
export const storePopup = writable<any>({});

// Mode/theme utilities
export const modeCurrent = writable<boolean>(false);
export const modeUserPrefers = writable<boolean>(false);
export const modeOsPrefers = writable<boolean>(false);

// Initialize mode from browser
if (typeof window !== 'undefined') {
	const isDark = document.documentElement.classList.contains('dark');
	modeCurrent.set(isDark);
	
	const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	modeOsPrefers.set(systemPrefersDark);
}

export function setModeCurrent(isDark: boolean): void {
	modeCurrent.set(isDark);
	if (typeof document !== 'undefined') {
		if (isDark) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}
}

export function setModeUserPrefers(isDark: boolean): void {
	modeUserPrefers.set(isDark);
}

export function setModeOsPrefers(isDark: boolean): void {
	modeOsPrefers.set(isDark);
}

export function setInitialClassState(): void {
	// This function is called in SSR context to set initial dark mode
	// In v4, we handle this in app.html script
}

// Clipboard utility
export const clipboard = {
	copy: async (text: string) => {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			await navigator.clipboard.writeText(text);
		}
	}
};

// CodeBlock placeholder - you may need to implement or find alternative
export const CodeBlock = null;

// Modal component placeholder  
export const Modal = null;
