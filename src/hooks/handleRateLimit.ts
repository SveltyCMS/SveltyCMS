/**
 * @file src/hooks/handleRateLimit.ts
 * @description Handles rate limiting for different types of requests
 *
 * Features:
 * - IP-based rate limiting
 * - User-Agent + IP combined limiting
 * - Cookie-based rate limiting with JWT secrets
 * - Stricter limits for API endpoints
 * - Static asset exemption
 * - Localhost development exemption
 * - Configurable rate limits per endpoint type
 */

import { building } from '$app/environment';
import { privateEnv } from '@root/config/private';
import { error, type Handle, type RequestEvent } from '@sveltejs/kit';
import { RateLimiter } from 'sveltekit-rate-limiter/server';
import { logger } from '@utils/logger.svelte';

// Initialize rate limiters
const limiter = new RateLimiter({
	IP: [300, 'h'], // 300 requests per hour per IP
	IPUA: [150, 'm'], // 150 requests per minute per IP+User-Agent
	cookie: {
		name: 'ratelimit',
		secret: privateEnv.JWT_SECRET_KEY as string,
		rate: [500, 'm'], // 500 requests per minute per cookie
		preflight: true
	}
});

// Stricter rate limiter for API requests
const apiLimiter = new RateLimiter({
	IP: [500, 'm'], // 500 requests per minute per IP
	IPUA: [200, 'm'] // 200 requests per minute per IP+User-Agent
});

// Check if the given IP is localhost
const isLocalhost = (ip: string): boolean => ip === '::1' || ip === '127.0.0.1';

const getClientIp = (event: RequestEvent): string => {
	try {
		return (
			event.getClientAddress() ||
			event.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
			event.request.headers.get('x-real-ip') ||
			'127.0.0.1'
		);
	} catch {
		return '127.0.0.1';
	}
};

// Check if a given pathname is a static asset
const isStaticAsset = (pathname: string): boolean =>
	pathname.startsWith('/static/') ||
	pathname.startsWith('/_app/') ||
	pathname.endsWith('.js') ||
	pathname.endsWith('.css') ||
	pathname === '/favicon.ico';

export const handleRateLimit: Handle = async ({ event, resolve }) => {
	const clientIp = getClientIp(event);
	if (isStaticAsset(event.url.pathname) || isLocalhost(clientIp) || building) {
		return resolve(event);
	}
	const currentLimiter = event.url.pathname.startsWith('/api/') ? apiLimiter : limiter;
	if (await currentLimiter.isLimited(event)) {
		logger.warn(`Rate limit exceeded for IP: \x1b[34m${clientIp}\x1b[0m, endpoint: \x1b[34m${event.url.pathname}\x1b[0m`);
		throw error(429, 'Too Many Requests. Please try again later.');
	}
	return resolve(event);
};
