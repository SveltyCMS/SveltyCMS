/**
 * @file src/actions/tokenTarget.ts
 * @description Svelte action that registers an input element with the token system.
 *
 * @param node - The input element to register.
 * @param options - The options for the token target.
 * @returns An object with an update and destroy method.
 *
 * Features:
 * - Registers an input element with the token system.
 * - Sets the active input in the store.
 * - Updates the active input when the options change.
 * - Destroys the active input when the element is removed from the DOM.
 */
import { activeInputStore } from '@src/stores/activeInputStore.svelte';

interface TokenTargetOptions {
	name: string;
	label?: string;
	collection?: string;
}

export function tokenTarget(node: HTMLInputElement | HTMLTextAreaElement, options: TokenTargetOptions) {
	function onFocus() {
		// Only update if the picker is already open
		if (activeInputStore.value) {
			activeInputStore.set({
				element: node,
				field: {
					name: options.name,
					label: options.label || options.name,
					collection: options.collection
				}
			});
		}
	}

	node.addEventListener('focus', onFocus);

	return {
		update(newOptions: TokenTargetOptions) {
			options = newOptions;
		},
		destroy() {
			node.removeEventListener('focus', onFocus);
			if (activeInputStore.value?.element === node) {
				activeInputStore.set(null);
			}
		}
	};
}
