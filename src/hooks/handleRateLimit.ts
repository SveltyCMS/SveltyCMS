/**
 * @file src/hooks/handleRateLimit.ts
 * @description Middleware for rate limiting to prevent abuse and DoS attacks
 *
 * ### Rate Limiting Strategy
 * - **General Routes**: 500 requests/minute per IP, IP+UA, and cookie
 * - **API Routes**: 500 requests/minute per IP, 200 requests/minute per IP+UA (stricter)
 * - **Exemptions**: Localhost, build process, static assets, setup routes
 *
 * ### Multi-Layer Protection
 * 1. **IP-based**: Prevents basic abuse from single source
 * 2. **IP + User-Agent**: Prevents abuse from same IP with multiple UAs
 * 3. **Cookie-based**: Signed cookie tracking for additional security
 *
 * ### Behavior
 * - Returns 429 "Too Many Requests" when limits exceeded
 * - Logs violations with IP and endpoint for monitoring
 * - Exempt routes bypass all checks for performance
 *
 * ### Prerequisites
 * - handleSystemState confirmed system is READY
 * - JWT_SECRET_KEY is configured for cookie signing
 *
 * @prerequisite System state is READY and JWT secret is available
 */

import { building } from '$app/environment';
import { error, type Handle, type RequestEvent } from '@sveltejs/kit';
import { RateLimiter } from 'sveltekit-rate-limiter/server';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { metricsService } from '@src/services/MetricsService';
import { logger } from '@utils/logger.svelte';

// --- RATE LIMITER CONFIGURATION ---

/**
 * General rate limiter for all non-API routes.
 * Uses IP, IP+UA, and signed cookies for multi-layer protection.
 */
const generalLimiter = new RateLimiter({
	IP: [500, 'm'], // 500 requests per minute per IP
	IPUA: [500, 'm'], // 500 requests per minute per IP+User-Agent
	cookie: {
		name: 'ratelimit',
		secret: getPrivateSettingSync('JWT_SECRET_KEY') || 'fallback-dev-secret',
		rate: [500, 'm'], // 500 requests per minute per cookie
		preflight: true // Check before request processing
	}
});

/**
 * Stricter rate limiter for API endpoints.
 * API routes get more restrictive IP+UA limits to prevent API abuse.
 */
const apiLimiter = new RateLimiter({
	IP: [500, 'm'], // 500 requests per minute per IP
	IPUA: [200, 'm'] // 200 requests per minute per IP+User-Agent (stricter)
});

// --- UTILITY FUNCTIONS ---

/**
 * Extracts the client's IP address from the request.
 * Tries multiple methods to handle various deployment environments.
 *
 * @param event - The SvelteKit request event
 * @returns The client's IP address, or '127.0.0.1' as fallback
 */
function getClientIp(event: RequestEvent): string {
	try {
		// Primary method: SvelteKit's built-in method
		const address = event.getClientAddress();
		if (address) return address;
	} catch {
		// Fallback for environments where getClientAddress doesn't work
	}

	// Fallback methods for proxied requests
	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}

	const realIp = event.request.headers.get('x-real-ip');
	if (realIp) {
		return realIp;
	}

	// Ultimate fallback
	return '127.0.0.1';
}

/**
 * Checks if an IP address is localhost.
 *
 * @param ip - The IP address to check
 * @returns True if the IP is localhost (IPv4 or IPv6)
 */
function isLocalhost(ip: string): boolean {
	return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/**
 * Checks if a pathname points to a static asset that should bypass rate limiting.
 * Static assets are typically cached by CDNs and don't need rate limiting.
 *
 * @param pathname - The URL pathname to check
 * @returns True if the path is a static asset
 */
function isStaticAsset(pathname: string): boolean {
	return (
		pathname.startsWith('/static/') ||
		pathname.startsWith('/_app/') ||
		pathname.endsWith('.js') ||
		pathname.endsWith('.css') ||
		pathname.endsWith('.map') ||
		pathname.endsWith('.woff') ||
		pathname.endsWith('.woff2') ||
		pathname.endsWith('.ttf') ||
		pathname.endsWith('.eot') ||
		pathname === '/favicon.ico' ||
		pathname === '/robots.txt' ||
		pathname === '/sitemap.xml'
	);
}

// --- MAIN HOOK ---

export const handleRateLimit: Handle = async ({ event, resolve }) => {
	const { url } = event;
	const clientIp = getClientIp(event);

	// --- Exemptions (Skip Rate Limiting) ---

	// 1. Build process - always exempt
	if (building) {
		return resolve(event);
	}

	// 2. Localhost in development - exempt for easier testing
	if (dev && isLocalhost(clientIp)) {
		return resolve(event);
	}

	// 3. Static assets - exempt for performance
	if (isStaticAsset(url.pathname)) {
		return resolve(event);
	}

	// --- Apply Rate Limiting ---

	// Choose appropriate limiter based on route type
	const limiter = url.pathname.startsWith('/api/') ? apiLimiter : generalLimiter;

	// Check if request exceeds rate limit
	if (await limiter.isLimited(event)) {
		// Track rate limit violation in unified metrics
		metricsService.incrementRateLimitViolations();

		logger.warn(
			`Rate limit exceeded for IP: \x1b[34m${clientIp}\x1b[0m, ` +
				`endpoint: \x1b[34m${url.pathname}\x1b[0m, ` +
				`UA: ${event.request.headers.get('user-agent')?.substring(0, 50) || 'unknown'}`
		);

		throw error(429, 'Too Many Requests. Please slow down and try again later.');
	}

	// Request is within limits, proceed
	return resolve(event);
};
