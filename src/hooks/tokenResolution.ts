/**
 * @file src/hooks/tokenResolution.ts
 * @description Middleware hook for RBAC-aware token resolution in API responses
 *
 * Features:
 * - Token Resolution
 * - Token Caching
 * - Token Modifiers
 * - Token Permissions
 * - Token Validation
 * - Token Escaping
 * - Token Replacement
 */
import type { Handle } from '@sveltejs/kit';
import { processTokensInResponse } from '@src/services/token/helper';
import { logger } from '@utils/logger';

export const handleTokenResolution: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Only process JSON API responses
	const contentType = response.headers.get('content-type');
	const isJson = contentType?.includes('application/json');
	const isApi = event.url.pathname.startsWith('/api/');

	if (!isJson || !isApi) {
		return response;
	}

	// Skip internal endpoints that shouldn't have token replacement
	if (
		event.url.pathname.startsWith('/api/system') ||
		event.url.pathname.startsWith('/api/dashboard') ||
		event.url.pathname.startsWith('/api/auth') ||
		event.url.pathname.startsWith('/api/graphql')
	) {
		return response;
	}

	try {
		// Clone response to read body (streaming-safe)
		const clonedResponse = response.clone();
		const body = await clonedResponse.json();

		// Process tokens with RBAC context
		// We use event.locals which are populated by handleAuthentication and handleAuthorization
		const processed = await processTokensInResponse(body, event.locals.user || undefined, (event.locals as any).contentLanguage || 'en', {
			tenantId: (event.locals as any).tenantId,
			roles: (event.locals as any).roles
			// Add collection context if available in locals (optional optimization)
			// collection: event.locals.collection
		});

		// Return new response with processed body
		return new Response(JSON.stringify(processed), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	} catch (error) {
		logger.error('Token resolution middleware failed', {
			error,
			path: event.url.pathname
		});
		// Return original response on error to prevent breakage
		return response;
	}
};
