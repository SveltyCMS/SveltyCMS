/**
 * @file src/hooks/handleRateLimit.ts
 * @description Middleware for rate limiting to prevent abuse and DoS attacks with clustered deployment support
 *
 * ### Rate Limiting Strategy
 * - **General Routes**: 500 requests/minute per IP, IP+UA, and cookie
 * - **API Routes**: 500 requests/minute per IP, 200 requests/minute per IP+UA (stricter)
 * - **Exemptions**: Localhost, build process, static assets
 *
 * ### Multi-Layer Protection
 * 1. **IP-based**: Prevents basic abuse from single source
 * 2. **IP + User-Agent**: Prevents abuse from same IP with multiple UAs
 * 3. **Cookie-based**: Signed cookie tracking for additional security
 * 4. **Distributed Store**: Redis/Database backend for clustered deployments
 *
 * ### Clustered Deployment Support
 * - Automatically uses Redis if available via CacheService
 * - Falls back to in-memory for single-instance deployments
 * - Shared rate limiting across all instances in load-balanced environments
 *
 * ### Behavior
 * - Returns 429 "Too Many Requests" when limits exceeded
 * - Logs violations with IP and endpoint for monitoring
 * - Exempt routes bypass all checks for performance
 *
 * ### Prerequisites
 * - handleSystemState confirmed system is READY
 * - JWT_SECRET_KEY is configured for cookie signing
 * - CacheService configured with Redis for distributed rate limiting
 *
 * @prerequisite System state is READY and JWT secret is available
 */

import { building } from '$app/environment';
import { error, type Handle, type RequestEvent } from '@sveltejs/kit';
import { RateLimiter } from 'sveltekit-rate-limiter/server';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { metricsService } from '@src/services/MetricsService';
import { cacheService } from '@src/databases/CacheService';
import { logger } from '@utils/logger.server';
import { AppError, handleApiError } from '@utils/errorHandling';

// --- RATE LIMITER CONFIGURATION ---

/**
 * Custom store plugin for distributed rate limiting using Redis/Database.
 * Enables shared rate limiting across clustered deployments.
 */
const distributedStore = {
	/**
	 * Gets the current count for a rate limit key
	 */
	async get(key: string): Promise<number | undefined> {
		try {
			const data = await cacheService.get<{ count: number; expires: number }>(`ratelimit:${key}`);
			if (data && data.expires > Date.now()) {
				return data.count;
			}
			return undefined;
		} catch (err) {
			logger.warn(`Distributed rate limit store GET failed: ${err instanceof Error ? err.message : String(err)}`);
			return undefined;
		}
	},

	async has(key: string): Promise<boolean> {
		return (await this.get(key)) !== undefined;
	},

	/**
	 * Adds/sets a value in the store (required by sveltekit-rate-limiter)
	 */
	async add(key: string, ttlSeconds: number): Promise<number> {
		try {
			if (await this.has(key)) {
				return this.increment(key, ttlSeconds);
			}
			const expires = Date.now() + ttlSeconds * 1000;
			await cacheService.set(`ratelimit:${key}`, { count: 1, expires }, ttlSeconds);
			return 1;
		} catch (err) {
			logger.error(`Distributed rate limit store ADD failed: ${err instanceof Error ? err.message : String(err)}`);
			return 0;
		}
	},

	/**
	 * Increments the counter for a rate limit key
	 */
	async increment(key: string, ttlSeconds: number): Promise<number> {
		try {
			const existing = await this.get(key);
			const newCount = (existing || 0) + 1;
			const expires = Date.now() + ttlSeconds * 1000;

			await cacheService.set(`ratelimit:${key}`, { count: newCount, expires }, ttlSeconds);
			console.log(`[RateLimit] INC ${key}: ${newCount}`);
			return newCount;
		} catch (err) {
			logger.error(`Distributed rate limit store INCREMENT failed: ${err instanceof Error ? err.message : String(err)}`);
			return 1; // Fail open to prevent blocking all traffic
		}
	},
	async clear(): Promise<void> {
		try {
			await cacheService.delete(`ratelimit:*`); // Clear all rate limit keys
		} catch (err) {
			logger.error(`Distributed rate limit store CLEAR failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
};

/** General limiter for all non-API routes with distributed store support */
const generalLimiter = new RateLimiter({
	IP: [500, 'm'],
	IPUA: [500, 'm'],
	cookie: {
		name: 'ratelimit',
		secret: getPrivateSettingSync('JWT_SECRET_KEY') || 'fallback-dev-secret',
		rate: [500, 'm'],
		preflight: false
	},
	// Enable distributed store if Redis is available
	store: cacheService ? distributedStore : undefined
});

/** Stricter limiter for API routes with distributed store support */
const apiLimiter = new RateLimiter({
	IP: [500, 'm'],
	IPUA: [200, 'm'],
	// Enable distributed store if Redis is available
	store: cacheService ? distributedStore : undefined
});

/** Stricter limiter for Auth routes (brute force protection) */
const authLimiter = new RateLimiter({
	IP: [10, 'm'], // 10 requests per minute per IP
	IPUA: [5, 'm'], // 5 requests per minute per IP+UA
	store: cacheService ? distributedStore : undefined
});

// --- UTILITY FUNCTIONS ---

/** Extracts client IP from request headers or environment */
function getClientIp(event: RequestEvent): string {
	try {
		const address = event.getClientAddress();
		if (address) return address;
	} catch {
		// Fallback to proxy headers
	}

	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) return forwarded.split(',')[0].trim();

	const realIp = event.request.headers.get('x-real-ip');
	if (realIp) return realIp;

	return '127.0.0.1';
}

/** Determines if an IP is localhost */
function isLocalhost(ip: string): boolean {
	return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/**
 * Checks if a pathname points to a static asset that should bypass rate limiting.
 * Static assets are typically cached by CDNs and don't need rate limiting.
 */
const STATIC_EXTENSIONS = /\.(js|css|map|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/;

function isStaticAsset(pathname: string): boolean {
	return (
		pathname.startsWith('/static/') ||
		pathname.startsWith('/_app/') ||
		pathname === '/favicon.ico' ||
		pathname === '/robots.txt' ||
		pathname === '/sitemap.xml' ||
		STATIC_EXTENSIONS.test(pathname)
	);
}

// --- MAIN HOOK ---

export const handleRateLimit: Handle = async ({ event, resolve }) => {
	const { url } = event;
	const clientIp = getClientIp(event);

	// --- Exemptions (Skip Rate Limiting) ---

	// 1. Build process
	if (building) return resolve(event);

	// 2. Localhost during development OR production
	const bypassLocalhost = event.request.headers.get('x-test-rate-limit-bypass-localhost') === 'true';
	if (isLocalhost(clientIp) && !bypassLocalhost) {
		return resolve(event);
	}

	// 3. Static assets (no need to rate limit CDN-cached content)
	if (isStaticAsset(url.pathname)) return resolve(event);

	try {
		// --- Apply Rate Limiting ---
		let limiter = generalLimiter;

		if (url.pathname.startsWith('/api/auth')) {
			limiter = authLimiter;
		} else if (url.pathname.startsWith('/api/')) {
			limiter = apiLimiter;
		}

		if (await limiter.isLimited(event)) {
			metricsService.incrementRateLimitViolations();

			logger.warn(
				`Rate limit exceeded for IP: ${clientIp}, ` +
					`endpoint: ${url.pathname}, ` +
					`UA: ${event.request.headers.get('user-agent')?.substring(0, 50) || 'unknown'}`
			);

			// Unified Error: Throw AppError instead of SvelteKit error
			throw new AppError('Too Many Requests. Please slow down and try again later.', 429, 'RATE_LIMIT_EXCEEDED');
		}

		return await resolve(event);
	} catch (err) {
		// Use unified error handling for API routes
		if (url.pathname.startsWith('/api/')) {
			return handleApiError(err, event);
		}

		// For UI routes, convert AppError back to SvelteKit error to show proper error page
		if (err instanceof AppError) {
			throw error(err.status, err.message);
		}

		throw err;
	}
};
