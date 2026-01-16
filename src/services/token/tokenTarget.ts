/**
 * @file src/services/token/tokenTarget.ts
 * @description Svelte Action to register inputs with the Token System.
 */
import { activeInputStore } from '@src/stores/activeInputStore.svelte';

interface TokenTargetOptions {
	name: string;
	label?: string;
	collection?: string;
	onInsert?: (token: string) => void;
}

export function tokenTarget(node: HTMLElement, options: TokenTargetOptions) {
	function onFocus() {
		activeInputStore.set({
			element: node as HTMLElement | null as any, // Cast for store compatibility (it expects input/textarea but works with custom if onInsert provided)
			field: {
				name: options.name,
				label: options.label || options.name,
				collection: options.collection
			},
			onInsert: options.onInsert
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
