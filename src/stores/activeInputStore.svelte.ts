/**
 * @file src/stores/activeInputStore.svelte.ts
 * @description Global store for the currently focused input element.
 *
 * Features:
 * - Stores the currently focused input element.
 * - Provides a global store for the currently focused input element.
 */

export interface ActiveTokenInput {
	element: HTMLInputElement | HTMLTextAreaElement | null;
	field: {
		name: string;
		label?: string;
		collection?: string;
	};
}

let activeInput = $state<ActiveTokenInput | null>(null);

export const activeInputStore = {
	get value() {
		return activeInput;
	},
	set(v: ActiveTokenInput | null) {
		activeInput = v;
	}
};
