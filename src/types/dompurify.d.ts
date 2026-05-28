/**
 * @file src/types/dompurify.d.ts
 * @description Ambient type declarations for dompurify dynamic imports.
 * dompurify v3 ships its own types, but dynamic `await import()`
 * in .svelte files may not resolve them in some language servers.
 */

declare module 'dompurify' {
	import type { Config as DOMPurifyConfig } from 'dompurify';

	interface DOMPurify {
		sanitize(dirty: string | Node, config?: DOMPurifyConfig): string;
		sanitize(dirty: string | Node, config: DOMPurifyConfig & { RETURN_DOM: true }): HTMLElement;
		sanitize(dirty: string | Node, config: DOMPurifyConfig & { RETURN_DOM_FRAGMENT: true }): DocumentFragment;
		sanitize(dirty: string | Node, config?: DOMPurifyConfig): string | HTMLElement | DocumentFragment;

		addHook(
			hook: string,
			callback: (node: Element, data: { attrName?: string; attrValue?: string; keepAttr?: boolean; allowedAttributes?: Record<string, boolean> }) => void,
		): void;

		removeHook(hook: string): void;
		removeHooks(hook: string): void;
		removeAllHooks(): void;

		setConfig(config: DOMPurifyConfig): void;
		clearConfig(): void;
		isSupported: boolean;
		version: string;
		removed: Array<{ element?: Node; attribute?: Attr | null; from?: Node }>;
	}

	const dompurify: DOMPurify;
	export default dompurify;
}
