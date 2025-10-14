/**
 * @file src/hooks.server.ts
 * @description Optimized server-side hooks for SvelteKit CMS application
 *
 * This file orchestrates a sequence of modular middleware to handle all incoming
 * server requests. The sequence is ordered to ensure security, efficiency, and
 * correctness according to a well-defined state machine.
 *
 * Middleware Sequence:
 * 1. Performance monitoring (start)
 * 2. System state validation (gatekeeper)
 * 3. Setup mode detection (gatekeeper)
 * 4. Static asset optimization (early exit)
 * 5. Rate limiting (security)
 * 6. Authentication & Multi-tenancy (identification)
 * 7. Authorization (security)
 * 8. API request handling (logic)
 * 9. Internationalization (i18n)
 * 10. Language preferences (UI)
 * 11. Theme management (UI)
 * 12. Security headers (security)
 * 13. Performance monitoring (end)
 */

import { building } from '$app/environment';
import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { logger } from '@utils/logger.svelte';

// --- Import all modular middleware hooks (in execution order) ---
import { handleSystemState } from './hooks/handleSystemState';
import { handleSetup } from './hooks/handleSetup';
import { handleStaticAssetCaching } from './hooks/handleStaticAssetCaching';
import { handleRateLimit } from './hooks/handleRateLimit';
import { handleAuthentication } from './hooks/handleAuthentication';
import { handleAuthorization } from './hooks/handleAuthorization';
import { handleApiRequests } from './hooks/handleApiRequests';
import { handleLocale } from './hooks/handleLocale';
import { handleTheme } from './hooks/handleTheme';
import { addSecurityHeaders } from './hooks/addSecurityHeaders';

// --- Cache Management (for external utilities) ---
import { invalidateSessionCache, clearAllSessionCaches } from './hooks/handleAuthentication';
import { SESSION_CACHE_TTL_MS } from '@src/databases/CacheService';

// --- Performance Monitoring Utilities ---

/**
 * Returns an emoji representing request performance based on response time.
 */
const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 75) return '🚀';
	if (responseTime < 250) return '⚡';
	if (responseTime < 750) return '⏱️';
	if (responseTime < 2000) return '🕰️';
	return '🐢';
};

/**
 * Middleware to mark the start time of a request for performance tracking.
 */
const handlePerfStart: Handle = async ({ event, resolve }) => {
	event.locals.__reqStart = performance.now();

	// Log incoming request (useful for debugging)
	const isSetupRoute = event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup');

	if (!isSetupRoute || event.url.pathname.startsWith('/api/setup')) {
		logger.debug(`\x1b[32m→\x1b[0m Request \x1b[34m${event.request.method} ${event.url.pathname}${event.url.search}\x1b[0m`);
	}

	return resolve(event);
};

/**
 * Middleware to log request completion time and performance metrics.
 */
const handlePerfLog: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const start = event.locals.__reqStart;

	if (typeof start === 'number') {
		const duration = performance.now() - start;
		const emoji = getPerformanceEmoji(duration);

		// Only log slow requests or errors to reduce noise
		const shouldLog = duration > 100 || response.status >= 400;

		if (shouldLog) {
			logger.debug(
				`\x1b[31m←\x1b[0m Completed \x1b[34m${event.url.pathname}\x1b[0m in \x1b[32m${duration.toFixed(1)}ms\x1b[0m ${emoji} (${response.status})`
			);
		}
	}

	return response;
};

// --- Health Metrics (for monitoring) ---

const healthMetrics = {
	requests: { total: 0, errors: 0 },
	auth: { validations: 0, failures: 0 },
	cache: { hits: 0, misses: 0 },
	lastReset: Date.now()
};

// Reset metrics every hour to prevent memory growth
if (!building) {
	setInterval(
		() => {
			healthMetrics.requests = { total: 0, errors: 0 };
			healthMetrics.auth = { validations: 0, failures: 0 };
			healthMetrics.cache = { hits: 0, misses: 0 };
			healthMetrics.lastReset = Date.now();
			logger.trace('Health metrics reset');
		},
		60 * 60 * 1000
	);
}

// --- Middleware Sequence ---

/**
 * The order of these hooks is critical for security and performance.
 * Each hook has a specific responsibility in the request lifecycle.
 */
const middleware: Handle[] = [
	// 1. Performance monitoring start (tracks request timing)
	handlePerfStart,

	// 2. System state validation (blocks requests if system is FAILED or INITIALIZING)
	handleSystemState,

	// 3. Setup mode gatekeeper (redirects to /setup if installation incomplete)
	handleSetup,

	// 4. Static asset optimization (early exit with caching headers)
	handleStaticAssetCaching,

	// 5. Rate limiting (prevents abuse and DoS attacks)
	handleRateLimit,

	// 6. Authentication & Multi-tenancy (validates session, identifies tenant/user)
	handleAuthentication,

	// 7. Authorization (checks permissions for protected routes)
	handleAuthorization,

	// 8. API request handling (API-specific logic and caching)
	handleApiRequests,

	// 9. Internationalization (Paraglide i18n - must run before language cookies)
	//i18n.handle(),

	// 10. Language preferences (syncs secondary language stores from cookies)
	handleLocale,

	// 11. Theme management (injects theme class for SSR)
	handleTheme,

	// 12. Security headers (adds CSP, HSTS, and other security headers)
	addSecurityHeaders,

	// 13. Performance monitoring end (logs completion time)
	handlePerfLog
];

// --- Main Handle Export ---

/**
 * The main handle function orchestrates all middleware in sequence.
 * Each middleware hook processes the request in order and can:
 * - Modify event.locals
 * - Throw errors or redirects
 * - Return early with a response
 * - Call resolve() to continue to the next hook
 */
export const handle: Handle = sequence(...middleware);

// --- Utility Functions for External Use ---

/**
 * Returns a snapshot of current health metrics.
 */
export const getHealthMetrics = () => ({ ...healthMetrics });

/**
 * Invalidates a specific user's session from all cache layers.
 * Useful when logging out a user or revoking their session.
 */
export { invalidateSessionCache, clearAllSessionCaches } from './hooks/handleAuthentication';

// --- Server Startup Logic ---

if (!building) {
	/**
	 * The main initialization logic (settings, DB connection) is handled
	 * in `src/databases/db.ts` to ensure it runs once on server start.
	 *
	 * The system will transition through these states:
	 * IDLE -> INITIALIZING -> READY (or DEGRADED/FAILED)
	 *
	 * The handleSystemState hook will block requests appropriately
	 * based on the current state.
	 */
	import('@src/databases/db')
		.then(() => {
			logger.info('✅ DB module loaded. System will initialize on first request via handleSystemState.');
		})
		.catch((error) => {
			logger.error('Fatal: Failed to load DB module during server startup:', error);
		});
}
