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

import type { Component } from 'svelte';

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
