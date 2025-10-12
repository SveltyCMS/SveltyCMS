/**
 * @file src/hooks/utils/parallel.ts
 * @description A SvelteKit hook utility to run multiple independent hooks in parallel.
 */

import type { Handle } from '@sveltejs/kit';

/**
 * Creates a single SvelteKit `Handle` function that runs multiple hooks in parallel.
 * This is useful for independent, I/O-bound hooks (e.g., reading user settings, themes, locales)
 * that would otherwise run sequentially in a `sequence` call.
 *
 * @param handles An array of `Handle` functions to execute in parallel.
 * @returns A single `Handle` function.
 */
export const parallel = (handles: Handle[]): Handle => {
	return async ({ event, resolve }) => {
		await Promise.all(handles.map((handle) => handle({ event, resolve: async () => {} })));
		return resolve(event);
	};
};
