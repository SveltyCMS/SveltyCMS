/**
 * @file src/hooks/tokenResolution.ts
 * @description Middleware that resolves tokens in JSON API responses.
 *
 * @param event - The SvelteKit event object.
 * @param resolve - The SvelteKit resolve function.
 * @returns The resolved response.
 *
 * Features:
 * - Resolves tokens in JSON API responses.
 * - Only processes JSON API responses for collection endpoints.
 * - Clones response body to avoid modifying the original response.
 * - Processes the response body with tokens.
 * - Returns the processed response.
 */

import { processObjectWithTokens } from '@src/utils/tokenHelper';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import type { Handle } from '@sveltejs/kit';

export const handleTokenResolution: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Only process JSON API responses for collection endpoints
	if (event.url.pathname.startsWith('/api/collection') && response.headers.get('content-type')?.includes('application/json')) {
		// Clone response body
		const body = await response.json();
		const processed = await processObjectWithTokens(body, {
			site: publicEnv,
			user: event.locals.user ?? undefined,
			system: { now: new Date() }
		});
		return new Response(JSON.stringify(processed), {
			status: response.status,
			headers: response.headers
		});
	}

	return response;
};
