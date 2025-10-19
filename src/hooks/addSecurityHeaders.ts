/**
 * @file src/hooks/addSecurityHeaders.ts
 * @description Simple security headers - let SvelteKit handle CSP
 */

import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const addSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Skip security headers for static assets
	const isStaticAsset =
		event.url.pathname.startsWith('/_app/') ||
		event.url.pathname.startsWith('/static/') ||
		/\.(js|css|png|jpg|svg|woff|woff2)$/.test(event.url.pathname);

	if (isStaticAsset) {
		return response;
	}

	// Basic security headers (SvelteKit handles CSP)
	response.headers.set('X-Frame-Options', 'SAMEORIGIN');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		['geolocation=()', 'microphone=()', 'camera=()', 'display-capture=()', 'clipboard-read=()', 'clipboard-write=(self)', 'web-share=(self)'].join(
			', '
		)
	);

	// HTTPS-only headers for production
	if (!dev && event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}

	return response;
};
