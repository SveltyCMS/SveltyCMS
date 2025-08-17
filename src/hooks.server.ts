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
 */

import { building } from '$app/environment';
import { enableSetupMode } from '@stores/globalSettings';
import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Core authentication and database
// (initializeRoles removed; handled in modular authorization hook when needed)

// Minimal private env import (avoid heavy DB work here; session/auth hook will handle)
// Private env import not needed here; setup handled in handleSetup / downstream hooks

// Stores (removed unused imports)

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

// Cache TTLs (centralized)
import { SESSION_CACHE_TTL_MS as CACHE_TTL_MS } from '@src/databases/CacheService';
const SESSION_TTL = CACHE_TTL_MS; // for metrics cleanup

// Circuit breaker logic is handled where needed; not used directly here after refactor

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

// Legacy in-file utilities removed; handled within modular hooks

/**
 * Identifies a tenant based on the request hostname.
 * In a real-world application, this would query a database of tenants.
 * This placeholder assumes a subdomain-based tenancy model (e.g., `my-tenant.example.com`).
 */

// Performance monitoring utilities
const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 75) return '🚀';
	if (responseTime < 250) return '⚡';
	if (responseTime < 750) return '⏱️';
	if (responseTime < 2000) return '🕰️';
	return '🐢';
};

// Extend locals typing for performance marker
declare module '@sveltejs/kit' {
	interface Locals {
		__reqStart?: number;
	}
}

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
		// Colorize URL (blue) and duration (green) for better scanability
		logger.debug(`Request \x1b[34m${event.url.pathname}\x1b[0m \x1b[32m${dt.toFixed(1)}ms\x1b[0m ${emoji}`);
	}
	return res;
};

// Build the middleware sequence based on configuration
const buildMiddlewareSequence = (): Handle[] => {
	const middleware: Handle[] = [];

	// 0. Perf start marker
	middleware.push(handlePerfStart);
	// 1. Setup gate
	middleware.push(handleSetup);
	// 2. Static asset caching
	middleware.push(handleStaticAssetCaching);
	// 3. Rate limiting
	middleware.push(handleRateLimit);
	// 4. Multi-tenancy (sets locals.tenantId)
	middleware.push(handleMultiTenancy);
	// 5. Session auth / rotation
	middleware.push(handleSessionAuth);
	// 6. Authorization & admin data
	middleware.push(handleAuthorization);
	// 7. API request handling & caching
	middleware.push(handleApiRequests);
	// 8. Locale management
	middleware.push(handleLocale);
	// 9. Security headers
	middleware.push(addSecurityHeaders);
	// 10. Perf logging (after all other mutations)
	middleware.push(handlePerfLog);

	return middleware;
};

// Combine all hooks using the optimized sequence
export const handle: Handle = sequence(...buildMiddlewareSequence());

// Export utility functions for external use
export const getHealthMetrics = () => ({ ...healthMetrics });

// NOTE: cache invalidation helpers should now be imported from './hooks/handleAuthorization'

export const cleanupSessionMetrics = (): void => {
	const now = Date.now();
	const METRIC_EXPIRY_THRESHOLD = 2 * SESSION_TTL;

	let cleanedCount = 0;
	for (const [sessionId, timestamp] of sessionMetrics.lastActivity) {
		if (now - timestamp > METRIC_EXPIRY_THRESHOLD) {
			sessionMetrics.lastActivity.delete(sessionId);
			sessionMetrics.activeExtensions.delete(sessionId);
			sessionMetrics.rotationAttempts.delete(sessionId);
			cleanedCount++;
		}
	}
	if (cleanedCount > 0) {
		logger.info(`Cleaned up metrics for \x1b[34m${cleanedCount}\x1b[0m stale sessions.`);
	}
};

// Load global settings from DB at server startup

// Enable setup mode initially to prevent startup errors
enableSetupMode();

// Only try to load settings if not in build mode
if (!building) {
	let shouldAttemptDbLoad = true;
	try {
		const { privateEnv } = await import('@root/config/private');
		const dbHostEmpty = !privateEnv?.DB_HOST || privateEnv.DB_HOST.trim() === '';
		const dbNameEmpty = !privateEnv?.DB_NAME || privateEnv.DB_NAME.trim() === '';
		if (dbHostEmpty || dbNameEmpty) {
			logger.info('ℹ️  DB credentials not provided yet (DB_HOST / DB_NAME empty) – staying in setup mode, skipping settings load.');
			shouldAttemptDbLoad = false;
		}
	} catch {
		// File missing or import error; remain in setup mode and skip DB load.
		shouldAttemptDbLoad = false;
	}

	if (shouldAttemptDbLoad) {
		try {
			await loadGlobalSettings();
			initializeRateLimiters();
			logger.info('✅ Settings loaded from database');
		} catch (error) {
			logger.info(`⚠️ Database not configured yet, using setup mode: ${error instanceof Error ? error.message : String(error)}`);
			enableSetupMode();
			shouldAttemptDbLoad = false;
		}
	}

	// Check if we need to seed default settings (if database is empty)
	try {
		if (shouldAttemptDbLoad) {
			const siteName = getGlobalSetting('SITE_NAME');
			if (!siteName) {
				logger.info('🌱 No settings found in database. Seeding default settings...');
				try {
					const { seedDefaultSettings } = await import('@src/databases/seedSettings');
					await seedDefaultSettings();
					await loadGlobalSettings(); // Reload settings after seeding
					initializeRateLimiters(); // Re-initialize rate limiters after seeding

					logger.info('✅ Default settings seeded successfully');
				} catch (error) {
					logger.error(`❌ Failed to seed default settings: ${error instanceof Error ? error.message : String(error)}`, { error });
				}
			}
		}
	} catch (error) {
		logger.warn(`⚠️ Could not check for seeding, continuing in setup mode: ${error instanceof Error ? error.message : String(error)}`);
	}
}
