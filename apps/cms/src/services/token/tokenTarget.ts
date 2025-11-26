/**
 * @file src/services/token/tokenTarget.ts
 * @description Svelte Action to register inputs with the Token System.
 */
import { activeInputStore } from '@src/stores/activeInputStore.svelte';

interface TokenTargetOptions {
	name: string;
	label?: string;
	collection?: string;
}

export function tokenTarget(node: HTMLInputElement | HTMLTextAreaElement, options: TokenTargetOptions) {
	function onFocus() {
		activeInputStore.set({
			element: node,
			field: {
				name: options.name,
				label: options.label || options.name,
				collection: options.collection
			}
		});
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
