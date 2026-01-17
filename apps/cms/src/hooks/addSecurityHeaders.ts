/**
 * @file apps/cms/src/hooks/addSecurityHeaders.ts
 * @description Security headers middleware with essential HTTP security headers
 *
 * ### Security Headers Applied
 * - **X-Frame-Options**: Prevents clickjacking attacks
 * - **X-Content-Type-Options**: Prevents MIME-sniffing vulnerabilities
 * - **Referrer-Policy**: Controls referrer information leakage
 * - **Permissions-Policy**: Restricts browser feature access
 * - **Strict-Transport-Security**: Enforces HTTPS in production
 *
 * ### CSP Handling
 * - Content Security Policy is managed by SvelteKit's built-in CSP system
 * - Configured in svelte.config.js for optimal nonce-based protection
 *
 * ### Performance
 * - Static assets are handled by handleStaticAssetCaching middleware (runs earlier)
 * - Minimal overhead as headers are only set for dynamic responses
 *
 * @prerequisite Static asset handling done by earlier middleware
 */

import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const addSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Static assets are already handled by handleStaticAssetCaching middleware

	// Basic security headers (SvelteKit handles CSP via svelte.config.js)
	response.headers.set('X-Frame-Options', 'SAMEORIGIN');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		['geolocation=()', 'microphone=()', 'camera=()', 'display-capture=()', 'clipboard-read=()', 'clipboard-write=(self)', 'web-share=(self)'].join(
			', '
		)
	);

	// HTTPS-only headers for production (CRITICAL: Fixed from 'httpss:' typo)
	if (!dev && event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}

	return response;
};
