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

import { processTokensInResponse } from '@src/services/token/helper';
import type { Handle } from '@sveltejs/kit';

export const handleTokenResolution: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Process JSON API responses for Collection REST API and GraphQL
	const isCollectionApi = event.url.pathname.startsWith('/api/collection');
	const isGraphQL = event.url.pathname.startsWith('/api/graphql');

	if ((isCollectionApi || isGraphQL) && response.headers.get('content-type')?.includes('application/json')) {
		// Clone response body
		try {
			const body = await response.json();
			const locale = (event.locals as any).locale || 'en'; // Assuming locale is set in locals, fallback to 'en'
			const processed = await processTokensInResponse(body, event.locals.user ?? undefined, locale);

			return new Response(JSON.stringify(processed), {
				status: response.status,
				headers: response.headers
			});
		} catch (e) {
			// If JSON parsing fails or other errors, return original response
			return response;
		}
	}

	return response;
};
