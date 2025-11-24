/**
 * Skeleton v2 to v4 Compatibility Layer
 * 
 * This provides Skeleton v2 APIs that wrap Skeleton v4 functionality where possible.
 * This allows the existing codebase to work while components are gradually migrated.
 */

import { writable, type Writable, get } from 'svelte/store';
import { createToaster } from '@zag-js/toast';

// Toast Store Compatibility
export interface ToastSettings {
	message: string;
	autohide?: boolean;
	timeout?: number;
	background?: string;
	classes?: string;
	action?: {
		label: string;
		response: () => void;
	};
}

export interface ToastStore extends Writable<any[]> {
	trigger: (settings: ToastSettings) => void;
	close: (id: string) => void;
	clear: () => void;
}

// Create a global toaster instance
const toaster = createToaster({
	placement: 'top-end',
	removeDelay: 250,
	max: 5
});

let toastStoreInstance: ToastStore | null = null;

export function getToastStore(): ToastStore {
	if (!toastStoreInstance) {
		const internalStore = writable<any[]>([]);
		
		// Subscribe to toaster changes and update our store
		toaster.subscribe((state) => {
			internalStore.set(state.toasts);
		});
		
		toastStoreInstance = {
			...internalStore,
			trigger: (settings: ToastSettings) => {
				toaster.create({
					title: settings.message,
					type: 'info',
					duration: settings.autohide === false ? Infinity : (settings.timeout || 3000),
					...(settings.action && {
						action: {
							label: settings.action.label,
							onClick: settings.action.response
						}
					})
				});
			},
			close: (id: string) => {
				toaster.remove(id);
			},
			clear: () => {
				const state = get(toaster);
				state.toasts.forEach((toast: any) => toaster.remove(toast.id));
			}
		};
	}
	return toastStoreInstance;
}

// Modal Store Compatibility
export interface ModalSettings {
	type: 'alert' | 'confirm' | 'prompt' | 'component';
	title?: string;
	body?: string;
	image?: string;
	component?: any;
	meta?: any;
	value?: string;
	buttonTextCancel?: string;
	buttonTextConfirm?: string;
	buttonTextSubmit?: string;
	response?: (r: any) => void;
}

export interface ModalComponent {
	ref: any;
	props?: Record<string, any>;
	slot?: string;
}

export interface ModalStore extends Writable<ModalSettings[]> {
	trigger: (settings: ModalSettings) => void;
	close: () => void;
	clear: () => void;
}

let modalStoreInstance: ModalStore | null = null;

export function getModalStore(): ModalStore {
	if (!modalStoreInstance) {
		const store = writable<ModalSettings[]>([]);
		modalStoreInstance = {
			...store,
			trigger: (settings: ModalSettings) => {
				console.warn('[Compat] Modal triggered:', settings.title || settings.type);
				console.warn('[Compat] Using native dialogs - migrate to Skeleton v4 Dialog for better UX');
				
				// Provide basic functionality using native dialogs
				if (settings.type === 'alert') {
					alert(`${settings.title || 'Alert'}\n\n${settings.body || ''}`);
					if (settings.response) settings.response(true);
				} else if (settings.type === 'confirm') {
					const result = confirm(`${settings.title || 'Confirm'}\n\n${settings.body || ''}`);
					if (settings.response) settings.response(result);
				} else if (settings.type === 'prompt') {
					const result = prompt(`${settings.title || 'Prompt'}\n\n${settings.body || ''}`, settings.value || '');
					if (settings.response) settings.response(result);
				} else {
					console.warn('[Compat] Component modals not supported - returning false');
					if (settings.response) settings.response(false);
				}
			},
			close: () => {
				store.set([]);
			},
			clear: () => {
				store.set([]);
			}
		};
	}
	return modalStoreInstance;
}

// Store Initialization
export function initializeStores() {
	// Initialize toast and modal stores
	getToastStore();
	getModalStore();
}

export const storePopup = writable<any>({});

// Popup Action Compatibility
export function popup(node: HTMLElement, args: PopupSettings) {
	console.warn('[Compat] popup() action - basic positioning, migrate to Popover recommended');
	
	if (!args || !args.target) return { destroy() {} };
	
	const targetEl = document.querySelector(`[data-popup="${args.target}"]`) as HTMLElement;
	if (!targetEl) return { destroy() {} };
	
	const handleEvent = () => {
		const isVisible = targetEl.style.display !== 'none';
		targetEl.style.display = isVisible ? 'none' : 'block';
		
		if (!isVisible) {
			const rect = node.getBoundingClientRect();
			targetEl.style.position = 'fixed';
			targetEl.style.top = `${rect.bottom + 5}px`;
			targetEl.style.left = `${rect.left}px`;
			targetEl.style.zIndex = '1000';
		}
	};
	
	const eventType = args.event || 'click';
	node.addEventListener(eventType, handleEvent);
	
	return {
		destroy() {
			node.removeEventListener(eventType, handleEvent);
		}
	};
}

export interface PopupSettings {
	event?: 'click' | 'hover' | 'focus-blur' | 'focus-click';
	target?: string;
	placement?: any;
	closeQuery?: string;
	state?: (e: any) => void;
	middleware?: any;
}

// Toast component export
export { Toast } from '@skeletonlabs/skeleton-svelte';

// Modal component placeholder
export const Modal = {
	Root: null,
	Trigger: null,
	Content: null
};

// Export working compat components
export { default as Avatar } from './skeleton-compat-components/Avatar.svelte';
export { default as Tab } from './skeleton-compat-components/Tab.svelte';
export { default as TabGroup } from './skeleton-compat-components/TabGroup.svelte';
export { default as ProgressBar } from './skeleton-compat-components/ProgressBar.svelte';
export { default as FileDropzone } from './skeleton-compat-components/FileDropzone.svelte';
export { default as RangeSlider } from './skeleton-compat-components/RangeSlider.svelte';
export { default as Ratings } from './skeleton-compat-components/Ratings.svelte';
export { default as CodeBlock } from './skeleton-compat-components/CodeBlock.svelte';
export { default as ListBox } from './skeleton-compat-components/ListBox.svelte';
export { default as ListBoxItem } from './skeleton-compat-components/ListBoxItem.svelte';

// Mode store
export const modeCurrent = writable<boolean>(false);

// Mode utilities
export function setModeUserPrefers(value: boolean) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('modeUserPrefers', value ? 'true' : 'false');
	}
}

export function setModeCurrent(value: boolean) {
	modeCurrent.set(value);
	if (typeof document !== 'undefined') {
		if (value) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}
}

export function setInitialClassState() {
	// This function is inlined in the HTML head to prevent FOUC
	const htmlEl = document.documentElement;
	const stored = localStorage.getItem('modeUserPrefers');
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	const useDark = stored ? stored === 'true' : prefersDark;
	
	if (useDark) {
		htmlEl.classList.add('dark');
	} else {
		htmlEl.classList.remove('dark');
	}
}

// Clipboard utility
export const clipboard = {
	copy: (text: string) => {
		if (navigator.clipboard) {
			navigator.clipboard.writeText(text).catch(console.error);
		}
	}
};
