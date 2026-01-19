/**
 * @file apps/cms/src/hooks/tokenResolution.ts
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
import { processTokensInResponse } from '@shared/services/token/helper';
import { logger } from '@shared/utils/logger';

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
		// Check if this is a collection list response (has items array)
		if (body && Array.isArray((body as any).items)) {
			const items = (body as any).items as any[];
			const contextBase = {
				tenantId: (event.locals as any).tenantId,
				roles: (event.locals as any).roles
			};

			// Process each item individually to provide self-reference context
			const processedItems = await Promise.all(
				items.map(async (item) => {
					const processed = await processTokensInResponse(item, event.locals.user || undefined, (event.locals as any).contentLanguage || 'en', {
						...contextBase,
						entry: item // Inject self as entry context
					});

					// Attach raw data for UI debugging/display (preserved original)
					if (processed && typeof processed === 'object') {
						processed.__raw = item;
					}
					return processed;
				})
			);

			// Reassign processed items to body
			(body as any).items = processedItems;

			// Process other top-level properties (like total, facets) without entry context
			// We can skip deep processing of items since we just did it
			// But for safety/completeness, we could process the rest excluding items?
			// Assuming other fields don't need entry context, we can just process them or leave them?
			// Let's just return the modifed body.
			var processed = body;
		} else {
			// Standard processing for single entry or other objects
			var processed = await processTokensInResponse(body, event.locals.user || undefined, (event.locals as any).contentLanguage || 'en', {
				tenantId: (event.locals as any).tenantId,
				roles: (event.locals as any).roles
			});
		}

		// Return new response with processed body
		// CRITICAL Fix: Remove content-length/encoding headers to prevent mismatches
		const newHeaders = new Headers(response.headers);
		newHeaders.delete('content-length');
		newHeaders.delete('content-encoding');

		return new Response(JSON.stringify(processed), {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders
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
