/**
 * @file src/utils/useLivePreview.ts
 * @description Frontend utility for consuming live preview data from the CMS admin.
 *
 * Usage in a SvelteKit page (or any frontend consuming the CMS):
 *
 * ```ts
 * import { createLivePreviewListener } from '@utils/useLivePreview';
 *
 * onMount(() => {
 *   const { destroy } = createLivePreviewListener({
 *     onUpdate: (data) => {
 *       // Merge draft data into your page state
 *       pageData = { ...pageData, ...data };
 *     }
 *   });
 *   return destroy;
 * });
 * ```
 *
 * The CMS admin sends `postMessage` events of type `svelty:update` with the
 * latest form data. This listener validates the origin and forwards the payload.
 *
 * The listener also posts a `svelty:init` message back to the parent to
 * signal that the preview iframe is ready to receive data.
 */

export interface LivePreviewOptions {
	/** Callback invoked with updated draft data from the CMS editor. */
	onUpdate: (data: Record<string, unknown>) => void;
	/** Restrict messages to a specific origin. Defaults to '*' (any origin). */
	origin?: string;
}

export function createLivePreviewListener(options: LivePreviewOptions): { destroy: () => void } {
	const { onUpdate, origin } = options;

	function handleMessage(event: MessageEvent) {
		// Validate origin if specified
		if (origin && origin !== '*' && event.origin !== origin) {
			return;
		}

		if (event.data?.type === 'svelty:update' && event.data.data) {
			onUpdate(event.data.data);
		}
	}

	window.addEventListener('message', handleMessage);

	// Signal to the parent CMS admin that we are ready
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'svelty:init' }, '*');
	}

	return {
		destroy() {
			window.removeEventListener('message', handleMessage);
		}
	};
}
