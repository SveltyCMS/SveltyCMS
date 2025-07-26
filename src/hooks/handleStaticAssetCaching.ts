/**
 * @file src/hooks/handleStaticAssetCaching.ts
 * @description Handles caching headers for static assets
 *
 * Features:
 * - Long-term caching for static assets (1 year)
 * - Immutable cache directives for better performance
 * - Selective asset type detection
 * - Optimal cache control headers for CDN and browser caching
 * - Support for _app, static, JS, CSS, and favicon assets
 */

import type { Handle } from '@sveltejs/kit';

// Check if a given pathname is a static asset
const isStaticAsset = (pathname: string): boolean =>
	pathname.startsWith('/static/') ||
	pathname.startsWith('/_app/') ||
	pathname.endsWith('.js') ||
	pathname.endsWith('.css') ||
	pathname === '/favicon.ico';

export const handleStaticAssetCaching: Handle = async ({ event, resolve }) => {
	if (isStaticAsset(event.url.pathname)) {
		const response = await resolve(event);
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
		return response;
	}
	return resolve(event);
};
