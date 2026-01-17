/**
 * @file src/services/token/tokenTarget.ts
 * @description Svelte Action to register inputs with the Token System.
 */
import { activeInput } from '@shared/stores/activeInputStore.svelte';

interface TokenTargetOptions {
	name: string;
	label?: string;
	collection?: string;
	onInsert?: (token: string) => void;
}

export function tokenTarget(node: HTMLElement, options: TokenTargetOptions) {
	function onFocus() {
		activeInput.set({
			element: node as HTMLElement | null as any,
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
			if (activeInput.current?.element === node) {
				activeInput.clear();
			}
		}
	};
}
