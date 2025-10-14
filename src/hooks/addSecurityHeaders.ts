/**
 * @file src/hooks/addSecurityHeaders.ts
 * @description Middleware that adds modern, robust security headers to all HTTP responses.
 *
 * ### Features
 * - Content-Security-Policy: The primary defense against XSS, replacing the deprecated X-XSS-Protection.
 * - X-Frame-Options: Prevents clickjacking attacks.
 * - X-Content-Type-Options: Prevents MIME type sniffing.
 * - Referrer-Policy: Controls how much referrer information is sent.
 * - Permissions-Policy: Manages feature access for the page and its iframes.
 * - Strict-Transport-Security: Enforces HTTPS connections in production.
 */

import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const addSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// --- Content Security Policy (CSP) ---
	const csp = [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"font-src 'self'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'self'",
		"connect-src 'self' https://api.iconify.design https://api.unisvg.com https://api.simplesvg.com https://raw.githubusercontent.com https://api.github.com https://github.com https://objects.githubusercontent.com"
	].join('; ');

	// Core security headers
	const headers = {
		'Content-Security-Policy': csp,
		'X-Frame-Options': 'SAMEORIGIN',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), display-capture=()'
	};

	Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));

	// HTTPS-specific headers
	if (!dev && event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}

	return response;
};
