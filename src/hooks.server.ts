/**
 * @file src/hooks.server.ts
 * @description Optimized server-side hooks for SvelteKit CMS application
 *
 * This file handles:
 * - Modular middleware architecture for performance
 * - Conditional loading based on environment settings
 * - Multi-tenant support (configurable)
 * - Redis caching (configurable)
 * - Static asset optimization
 * - Rate limiting
 * - Session authentication and management
 * - Authorization and role management
 * - API request handling with caching
 * - Locale management
 * - Security headers
 * - Performance monitoring
 * - Integration with production-grade configuration system
 */

import { building } from '$app/environment';
import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Cache
import { sessionCache, sessionMetrics } from '@src/hooks/utils/session';

// System Logger
import { logger } from '@utils/logger.svelte';

// Import middleware modules
import { addSecurityHeaders } from './hooks/addSecurityHeaders';
import { handleApiRequests } from './hooks/handleApiRequests';
import { handleAuthorization } from './hooks/handleAuthorization';
import { handleLocale } from './hooks/handleLocale';
import { handleMultiTenancy } from './hooks/handleMultiTenancy';
import { handleRateLimit } from './hooks/handleRateLimit';
import { handleSessionAuth } from './hooks/handleSessionAuth';
import { handleSetup } from './hooks/handleSetup';
import { handleStaticAssetCaching } from './hooks/handleStaticAssetCaching';
import { handleTheme } from './hooks/handleTheme';

// Cache TTLs (centralized)
import { SESSION_CACHE_TTL_MS as CACHE_TTL_MS } from '@src/databases/CacheService';
const SESSION_TTL = CACHE_TTL_MS; // for metrics cleanup

// Health metrics for monitoring
const healthMetrics = {
	requests: { total: 0, errors: 0 },
	auth: { validations: 0, failures: 0 },
	cache: { hits: 0, misses: 0 },
	sessions: { active: 0, rotations: 0 },
	lastReset: Date.now()
};

// Reset metrics every hour to prevent memory growth
setInterval(
	() => {
		Object.assign(healthMetrics, {
			requests: { total: 0, errors: 0 },
			auth: { validations: 0, failures: 0 },
			cache: { hits: 0, misses: 0 },
			sessions: { active: sessionCache.size, rotations: 0 },
			lastReset: Date.now()
		});
	},
	60 * 60 * 1000
);

// Performance monitoring utilities
const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 75) return '🚀';
	if (responseTime < 250) return '⚡';
	if (responseTime < 750) return '⏱️';
	if (responseTime < 2000) return '🕰️';
	return '🐢';
};

// Perf start hook (very cheap)
const handlePerfStart: Handle = async ({ event, resolve }) => {
	event.locals.__reqStart = performance.now();
	return resolve(event);
};

// Perf end hook (logs duration)
const handlePerfLog: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	const start = event.locals.__reqStart;
	if (typeof start === 'number') {
		const dt = performance.now() - start;
		const emoji = getPerformanceEmoji(dt);
		// Only log requests that are slow (>100ms) or errors, or not setup-related
		const isSetupRelated = event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup');
		const shouldLog = dt > 100 || res.status >= 400 || !isSetupRelated;
		if (shouldLog) {
			// Colorize URL (blue) and duration (green) for better scanability
			logger.debug(`Request ${event.url.pathname}${event.url.search} \x1b[32m${dt.toFixed(1)}ms\x1b[0m ${emoji}`);
		}
	}
	return res;
};

// Configuration initialization hook
const handleConfigInit: Handle = async ({ event, resolve }) => {
	// This hook is now a placeholder.
	// Global settings are loaded in db.ts and accessed via stores.
	return resolve(event);
};

// Build the middleware sequence based on configuration
const buildMiddlewareSequence = (): Handle[] => {
	const middleware: Handle[] = [];

	// 0. Configuration initialization
	middleware.push(handleConfigInit);
	// 1. Perf start marker
	middleware.push(handlePerfStart);
	// 2. Setup gate
	middleware.push(handleSetup);
	// 3. Static asset caching
	middleware.push(handleStaticAssetCaching);
	// 4. Rate limiting
	middleware.push(handleRateLimit);
	// 5. Multi-tenancy (sets locals.tenantId)
	middleware.push(handleMultiTenancy);
	// 6. Session auth / rotation
	middleware.push(handleSessionAuth);
	// 7. Authorization & admin data
	middleware.push(handleAuthorization);
	// 8. API request handling & caching
	middleware.push(handleApiRequests);
	// 9. Theme management
	middleware.push(handleTheme);
	// 10. Locale management
	middleware.push(handleLocale);
	// 11. Security headers
	middleware.push(addSecurityHeaders);
	// 12. Perf logging (after all other mutations)
	middleware.push(handlePerfLog);

	return middleware;
};

// Export the main handle function
export const handle: Handle = sequence(...buildMiddlewareSequence());

// Export utility functions for external use
export const getHealthMetrics = () => ({ ...healthMetrics });

// Cache invalidation helpers (now integrated with config service)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const invalidateAdminCache = (_cacheKey?: 'roles' | 'users' | 'tokens', _tenantId?: string): void => {
	// This is now handled in the handleAuthorization hook
	// Keeping for backward compatibility
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const invalidateUserCountCache = (_tenantId?: string): void => {
	// This is now handled in the handleAuthorization hook
	// Keeping for backward compatibility
};

export const cleanupSessionMetrics = (): void => {
	const now = Date.now();
	const expiredSessions: string[] = [];

	for (const [sessionId, session] of sessionCache.entries()) {
		const lastActivity = sessionMetrics.lastActivity.get(sessionId) || session.timestamp;
		if (now - lastActivity > SESSION_TTL) {
			expiredSessions.push(sessionId);
		}
	}

	for (const sessionId of expiredSessions) {
		sessionCache.delete(sessionId);
	}

	if (expiredSessions.length > 0) {
		logger.debug(`Cleaned up ${expiredSessions.length} expired sessions`);
	}
};

// Load settings from database at server startup
if (!building) {
	// The main initialization logic, including settings, is now in `src/databases/db.ts`.
	// This ensures settings are loaded before any hooks run.
	// We can import `dbInitPromise` to ensure the database is ready if needed.
	import('@src/databases/db')
		.then(() => {
			// We don't call initializeOnRequest() here anymore.
			// It will be called by the `handleSetup` hook on the first real request.
			logger.info('✅ DB module loaded. Initialization will occur on first non-setup request.');
		})
		.catch((error) => {
			logger.error('Failed to load db module for initialization:', error);
		});
}
