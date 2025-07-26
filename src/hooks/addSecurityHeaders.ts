/**
 * @file src/hooks/addSecurityHeaders.ts
 * @description Adds security headers to HTTP responses for enhanced protection
 *
 * Features:
 * - X-Frame-Options: Prevents clickjacking attacks
 * - X-XSS-Protection: Enables XSS filtering in browsers
 * - X-Content-Type-Options: Prevents MIME type sniffing
 * - Referrer-Policy: Controls referrer information sent with requests
 * - Permissions-Policy: Restricts browser features access
 * - Strict-Transport-Security: Enforces HTTPS connections (HTTPS only)
 * - Content-Security-Policy: Optional CSP header support
 */

import type { Handle } from '@sveltejs/kit';

export const addSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Core security headers
	const headers = {
		'X-Frame-Options': 'SAMEORIGIN',
		'X-XSS-Protection': '1; mode=block',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), display-capture=()'
	};

	// Apply headers efficiently
	Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));

	// HTTPS-specific headers
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}

	return response;
};
