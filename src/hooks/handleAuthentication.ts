/**
 * @file src/hooks/handleAuthentication.ts
 * @description Consolidated middleware for session validation, user identification, and multi-tenancy with optimized memory management.
 *
 * @summary This hook runs after handleSystemState and handleSetup confirm the system is ready. It:
 * - Attaches the database adapter to event.locals
 * - Identifies the tenant from the hostname (if multi-tenancy is enabled)
 * - Validates the session cookie and attaches the user object
 * - Uses multi-layer caching (in-memory → Redis → database) for performance
 * - Enforces tenant isolation for security
 * - Implements WeakRef-based cache cleanup for automatic garbage collection
 *
 * ### Memory Optimization
 * - Uses WeakRef for automatic GC of unused session data
 * - FinalizationRegistry tracks cache entries for cleanup
 * - Ideal for clustered/edge environments with memory constraints
 *
 * @prerequisite handleSystemState and handleSetup have already confirmed readiness
 */

import type { Handle } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { SESSION_COOKIE_NAME } from '@src/databases/auth/constants';
import type { User } from '@src/databases/auth/types';
import { auth, dbAdapter } from '@src/databases/db';
import { cacheService, SESSION_CACHE_TTL_MS } from '@src/databases/CacheService';
import { logger } from '@utils/logger.svelte';

// --- IN-MEMORY SESSION CACHE WITH WEAKREF-BASED CLEANUP ---

/**
 * WeakRef-based session cache for automatic garbage collection.
 * This approach allows the JavaScript engine to clean up unused sessions
 * without requiring full iteration through the cache.
 *
 * Benefits:
 * - Lower memory overhead in high-traffic scenarios
 * - Automatic cleanup of unused sessions
 * - Better for clustered/edge environments
 * - No periodic setInterval cleanup needed
 */

interface SessionCacheEntry {
	user: User;
	timestamp: number;
}

/**
 * Main session cache using WeakRef for automatic GC.
 * Each entry can be garbage collected when no longer referenced.
 */
const sessionCache = new Map<string, WeakRef<SessionCacheEntry>>();

/**
 * FinalizationRegistry to track when cache entries are garbage collected.
 * This allows us to clean up the Map keys when values are GC'd.
 */
const sessionCacheRegistry = new FinalizationRegistry<string>((sessionId) => {
	sessionCache.delete(sessionId);
	logger.trace(`Session cache entry GC'd: ${sessionId.substring(0, 8)}...`);
});

/**
 * Strong references to prevent immediate GC of recently accessed sessions.
 * This LRU-style cache keeps the most recent N sessions in memory.
 */
const MAX_STRONG_REFS = 100;
const strongRefs = new Map<string, SessionCacheEntry>();

/**
 * Prevents frequent DB lookups for invalid sessions.
 */
const lastRefreshAttempt = new Map<string, number>();

/**
 * Gets a session from the cache, handling WeakRef dereferencing.
 */
function getSessionFromCache(sessionId: string): SessionCacheEntry | null {
	const now = Date.now();

	// Check strong references first (most recent)
	const strongRef = strongRefs.get(sessionId);
	if (strongRef && now - strongRef.timestamp < SESSION_CACHE_TTL_MS) {
		return strongRef;
	}

	// Check weak references
	const weakRef = sessionCache.get(sessionId);
	if (weakRef) {
		const entry = weakRef.deref();
		if (entry && now - entry.timestamp < SESSION_CACHE_TTL_MS) {
			// Promote to strong reference
			addToStrongRefs(sessionId, entry);
			return entry;
		}
	}

	return null;
}

/**
 * Sets a session in the cache with WeakRef.
 */
function setSessionInCache(sessionId: string, entry: SessionCacheEntry): void {
	// Add to strong refs (LRU)
	addToStrongRefs(sessionId, entry);

	// Add to weak refs with GC tracking
	const weakRef = new WeakRef(entry);
	sessionCache.set(sessionId, weakRef);
	sessionCacheRegistry.register(entry, sessionId);
}

/**
 * Adds/updates a session in the strong reference LRU cache.
 */
function addToStrongRefs(sessionId: string, entry: SessionCacheEntry): void {
	// Remove if exists (for LRU re-insertion)
	if (strongRefs.has(sessionId)) {
		strongRefs.delete(sessionId);
	}

	// Add to end (most recent)
	strongRefs.set(sessionId, entry);

	// Evict oldest if over limit
	if (strongRefs.size > MAX_STRONG_REFS) {
		const firstKey = strongRefs.keys().next().value;
		if (firstKey) {
			strongRefs.delete(firstKey);
		}
	}
}

// Periodic cleanup of expired strong references and lastRefreshAttempt
if (typeof setInterval !== 'undefined') {
	setInterval(
		() => {
			const now = Date.now();

			// Clean expired strong refs
			for (const [sessionId, data] of strongRefs.entries()) {
				if (now - data.timestamp > SESSION_CACHE_TTL_MS) {
					strongRefs.delete(sessionId);
				}
			}

			// Clean old refresh attempts
			for (const [sessionId, timestamp] of lastRefreshAttempt.entries()) {
				if (now - timestamp > 300000) {
					// 5 minutes
					lastRefreshAttempt.delete(sessionId);
				}
			}

			logger.trace(`Session cache cleanup: ${strongRefs.size} strong refs, ${sessionCache.size} weak refs`);
		},
		5 * 60 * 1000
	);
}

// --- UTILITY FUNCTIONS ---

/** Derives tenant ID from hostname */
function getTenantIdFromHostname(hostname: string): string | null {
	if (!getPrivateSettingSync('MULTI_TENANT')) return null;

	if (hostname === 'localhost' || hostname.startsWith('127.0.0.1') || hostname.startsWith('192.168.')) {
		return 'default';
	}

	const parts = hostname.split('.');
	if (parts.length > 2 && !['www', 'app', 'api', 'cdn', 'static'].includes(parts[0])) {
		return parts[0];
	}

	return null;
}

/** Multi-layer user session retrieval (in-memory → distributed → DB) */
async function getUserFromSession(sessionId: string, tenantId?: string): Promise<User | null> {
	const now = Date.now();

	// Layer 1: In-memory cache with WeakRef (fastest)
	const memCached = getSessionFromCache(sessionId);
	if (memCached) {
		logger.trace(`Session cache hit (memory): \x1b[33m${sessionId.substring(0, 8)}...\x1b[0m`);
		return memCached.user;
	}

	// Layer 2: Distributed cache (Redis)
	try {
		const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
		const redisCached = await cacheService.get<SessionCacheEntry>(cacheKey, tenantId);
		if (redisCached && now - redisCached.timestamp < SESSION_CACHE_TTL_MS) {
			setSessionInCache(sessionId, redisCached);
			logger.trace(`Session cache hit (redis): ${sessionId.substring(0, 8)}...`);
			return redisCached.user;
		}
	} catch (err) {
		logger.warn(`Redis session read failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Layer 3: Database (source of truth)
	const lastAttempt = lastRefreshAttempt.get(sessionId);
	if (lastAttempt && now - lastAttempt < 60000) return null; // 1-minute cooldown
	lastRefreshAttempt.set(sessionId, now);

	if (!auth) {
		logger.error('Auth service unavailable, skipping session validation.');
		return null;
	}

	try {
		const user = await auth.validateSession(sessionId);
		if (user) {
			const sessionData: SessionCacheEntry = { user, timestamp: now };
			setSessionInCache(sessionId, sessionData);
			const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
			await cacheService
				.set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1000), tenantId)
				.catch((err) => logger.warn(`Session cache set failed: ${err.message}`));
			logger.trace(`Session validated from DB: \x1b[33m${sessionId.substring(0, 8)}...\x1b[0m`);
			return user;
		}
	} catch (err) {
		logger.error(`Session validation failed for ${sessionId.substring(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
	}

	return null;
}

// --- MAIN HOOK ---

export const handleAuthentication: Handle = async ({ event, resolve }) => {
	const { locals, url, cookies } = event;

	// Skip internal or special requests
	if (url.pathname.startsWith('/.well-known/') || url.pathname.startsWith('/_')) {
		return resolve(event);
	}

	// Skip public routes
	const publicRoutes = ['/login', '/register', '/forgot-password'];
	if (publicRoutes.some((r) => url.pathname.startsWith(r))) {
		return resolve(event);
	}

	// --- Setup Guard Removed ---
	// handleSetup already handles unconfigured states, saving import overhead.

	// Attach database adapter
	locals.dbAdapter = dbAdapter;
	if (!dbAdapter) {
		logger.warn('Database adapter unavailable; system initializing.');
		// During setup/initialization, skip authentication entirely
		// handleSetup will enforce proper access control for setup routes
		return resolve(event);
	}

	// Step 1: Multi-tenancy (synchronous check)
	const multiTenant = getPrivateSettingSync('MULTI_TENANT');
	if (multiTenant) {
		const tenantId = getTenantIdFromHostname(url.hostname);
		if (!tenantId) {
			logger.error(`Tenant not found for hostname: ${url.hostname}`);
			throw error(404, `Tenant not found for hostname: ${url.hostname}`);
		}
		locals.tenantId = tenantId;
		logger.trace(`Tenant identified: ${tenantId}`);
	}

	// Step 2: Session validation
	const sessionId = cookies.get(SESSION_COOKIE_NAME);
	if (sessionId) {
		const user = await getUserFromSession(sessionId, locals.tenantId);
		if (user) {
			if (locals.tenantId && user.tenantId && user.tenantId !== locals.tenantId) {
				logger.warn(`Tenant isolation violation: User \x1b[34m${user._id}\x1b[0m (tenant: ${user.tenantId}) tried ${locals.tenantId}`);
				cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			} else {
				locals.user = user;
				locals.session_id = sessionId;
				logger.trace(`User authenticated: \x1b[34m${user._id}\x1b[0m`);
			}
		} else {
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			logger.trace(`Invalid session removed: ${sessionId.substring(0, 8)}...`);
		}
	}

	return resolve(event);
};

// --- UTILITY EXPORTS ---

/** Invalidate a single session from all cache layers */
export function invalidateSessionCache(sessionId: string, tenantId?: string): void {
	sessionCache.delete(sessionId);
	strongRefs.delete(sessionId);
	lastRefreshAttempt.delete(sessionId);
	const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
	cacheService.delete(cacheKey, tenantId).catch((err) => logger.warn(`Failed to delete session from Redis: ${err.message}`));
	logger.debug(`Session cache invalidated: ${sessionId.substring(0, 8)}...`);
}

/** Clear session refresh cooldown to allow immediate validation */
export function clearSessionRefreshAttempt(sessionId: string): void {
	lastRefreshAttempt.delete(sessionId);
}

/** Clears all session caches (maintenance only) */
export function clearAllSessionCaches(): void {
	sessionCache.clear();
	strongRefs.clear();
	lastRefreshAttempt.clear();
	logger.info('All session caches cleared');
}
