/**
 * @file apps/cms/src/hooks/handleAuthentication.ts
 * @description Enterprise-grade authentication middleware with session validation, rotation, and multi-tenancy.
 *
 * @summary This hook runs after handleSystemState and handleSetup confirm the system is ready. It provides:
 * - **Session Management**: Validates session cookies with 3-layer caching (in-memory → Redis → database)
 * - **Security Token Rotation**: Automatic token rotation for active sessions (prevents session hijacking)
 * - **Multi-tenancy**: Hostname-based tenant identification with strict isolation
 * - **Memory Optimization**: WeakRef-based cache with automatic garbage collection
 * - **Rate Limiting**: Session rotation rate limits to prevent abuse
 * - **Metrics Integration**: Comprehensive tracking via MetricsService
 *
 * ### Features
 * - Session rotation every 15 minutes for active users
 * - WeakRef cache with LRU eviction (top 100 hot sessions)
 * - Tenant isolation enforcement (prevents cross-tenant access)
 * - Rate-limited refresh attempts (100/min per IP)
 * - Automatic cleanup of expired sessions
 * - Zero-downtime session validation
 *
 * @prerequisite handleSystemState and handleSetup have already confirmed readiness
 */

import type { Handle, RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getPrivateSettingSync } from '@shared/services/settingsService';
import { SESSION_COOKIE_NAME } from '@shared/database/auth/constants';
import type { User } from '@shared/database/auth/types';
import type { ISODateString } from '@shared/database/dbInterface';
import { auth, dbAdapter } from '@shared/database/db';
import { getSystemState } from '@cms/stores/system';
import { seedDemoTenant } from '@shared/database/seed';
import { cacheService, SESSION_CACHE_TTL_MS } from '@shared/database/CacheService';
import { logger } from '@shared/utils/logger.server';
import { metricsService } from '@shared/services/MetricsService';
import { RateLimiter } from 'sveltekit-rate-limiter/server';

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
 * Tracks last session rotation time to prevent excessive rotation.
 * Key: sessionId, Value: timestamp of last rotation
 */
const lastRotationAttempt = new Map<string, number>();

/**
 * Session rotation interval: 15 minutes
 * Balances security (regular token refresh) with performance (reduced DB writes)
 */
const SESSION_ROTATION_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Rate limiter for session rotation to prevent abuse.
 * Limits: 100 rotation attempts per minute per IP
 */
const rotationRateLimiter = new RateLimiter({
	IP: [100, 'm'],
	cookie: {
		name: 'session_rotation_limit',
		secret: getPrivateSettingSync('JWT_SECRET_KEY') || 'fallback-dev-secret',
		rate: [100, 'm'],
		preflight: true
	}
});

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

			// Clean old rotation attempts
			for (const [sessionId, timestamp] of lastRotationAttempt.entries()) {
				if (now - timestamp > SESSION_ROTATION_INTERVAL_MS * 2) {
					lastRotationAttempt.delete(sessionId);
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
		logger.trace(`Session cache hit (memory): ${sessionId.substring(0, 8)}...`);
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
		// Only log as error if system is ready, otherwise suppress or log as debug
		const sysState = getSystemState();
		if (sysState.overallState === 'READY' || sysState.overallState === 'DEGRADED') {
			logger.error('Auth service unavailable, skipping session validation.');
		} else {
			logger.debug('Auth service not ready, skipping session validation.');
		}
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
			logger.trace(`Session validated from DB: ${sessionId.substring(0, 8)}...`);
			return user;
		}
	} catch (err) {
		logger.error(`Session validation failed for ${sessionId.substring(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
	}

	return null;
}

/**
 * Handles automatic session rotation for security.
 * Rotates session tokens every 15 minutes for active users to prevent session hijacking.
 *
 * @param event - SvelteKit request event
 * @param user - Authenticated user object
 * @param oldSessionId - Current session ID
 * @returns Promise<void>
 */
async function handleSessionRotation(event: RequestEvent, user: User, oldSessionId: string): Promise<void> {
	const now = Date.now();

	// Check if rotation is needed (15-minute interval)
	const lastRotation = lastRotationAttempt.get(oldSessionId);
	if (lastRotation && now - lastRotation < SESSION_ROTATION_INTERVAL_MS) {
		return; // Too soon for rotation
	}

	// Rate limit check
	if (await rotationRateLimiter.isLimited(event)) {
		logger.debug(`Session rotation rate limited for session ${oldSessionId.substring(0, 8)}...`);
		return;
	}

	// Attempt rotation
	try {
		if (!auth?.createSession || !auth?.destroySession) {
			logger.warn('Session rotation not supported by auth adapter');
			return;
		}

		// Create new session with same user
		const newSession = await auth.createSession({
			user_id: user._id,
			expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() as ISODateString, // 30 days
			tenantId: event.locals.tenantId
		});

		if (newSession && newSession._id !== oldSessionId) {
			const newSessionId = newSession._id;

			// Update cookie with new session ID
			event.cookies.set(SESSION_COOKIE_NAME, newSessionId, {
				path: '/',
				httpOnly: true,
				secure: event.url.protocol === 'https:' || (event.url.hostname !== 'localhost' && !dev),
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 30 // 30 days
			});

			// Destroy old session
			await auth
				.destroySession(oldSessionId)
				.catch((err) => logger.warn(`Failed to destroy old session ${oldSessionId.substring(0, 8)}: ${err.message}`));

			// Invalidate old session from all caches
			invalidateSessionCache(oldSessionId, event.locals.tenantId);

			// Cache new session
			const sessionData: SessionCacheEntry = { user, timestamp: now };
			setSessionInCache(newSessionId, sessionData);

			const cacheKey = event.locals.tenantId ? `session:${event.locals.tenantId}:${newSessionId}` : `session:${newSessionId}`;
			await cacheService
				.set(cacheKey, sessionData, Math.ceil(SESSION_CACHE_TTL_MS / 1000), event.locals.tenantId)
				.catch((err) => logger.warn(`Failed to cache rotated session: ${err.message}`));

			// Update locals with new session ID
			event.locals.session_id = newSessionId;

			// Track rotation
			lastRotationAttempt.set(newSessionId, now);

			metricsService.incrementAuthValidations();
			logger.info(`Session rotated for user ${user._id}: ${oldSessionId.substring(0, 8)}... → ${newSessionId.substring(0, 8)}...`);
		}
	} catch (err) {
		// Non-fatal error - log but don't break the session
		logger.error(`Session rotation failed for ${oldSessionId.substring(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);

		// If rotation fails due to invalid session, this is critical
		if (err instanceof Error && err.message.includes('invalid')) {
			event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			event.locals.user = null;
			event.locals.session_id = undefined;
			invalidateSessionCache(oldSessionId, event.locals.tenantId);
			throw error(401, 'Session expired. Please log in again.');
		}
	}
}

// --- MAIN HOOK ---

export const handleAuthentication: Handle = async ({ event, resolve }) => {
	const { locals, url, cookies } = event;

	// Skip internal or special requests
	const ASSET_REGEX =
		/^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;
	if (url.pathname.startsWith('/.well-known/') || url.pathname.startsWith('/_') || ASSET_REGEX.test(url.pathname)) {
		return resolve(event);
	}

	// Skip public routes
	const publicRoutes = ['/login', '/register', '/forgot-password', '/setup', '/api/setup'];
	const isLocalizedPublic = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register|forgot-password)/.test(url.pathname);

	if (publicRoutes.some((r) => url.pathname.startsWith(r)) || isLocalizedPublic) {
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
	const isDemoMode = getPrivateSettingSync('DEMO');

	if (multiTenant) {
		let tenantId: string | null = null;

		if (isDemoMode) {
			// For demo mode, try to get tenantId from cookie first
			tenantId = cookies.get('demo_tenant_id') || null;

			if (!tenantId) {
				// If no demo_tenant_id cookie, generate a new one
				tenantId = crypto.randomUUID();
				// Set the cookie for future requests in this session
				cookies.set('demo_tenant_id', tenantId, {
					path: '/',
					httpOnly: true,
					secure: url.protocol === 'https:' || (url.hostname !== 'localhost' && !dev),
					sameSite: 'lax',
					maxAge: 60 * 20 // 20 minutes for a demo session
				});
				logger.info(`New demo tenant generated: ${tenantId}`);

				// --- Trigger Tenant Seeding Here ---
				try {
					await seedDemoTenant(dbAdapter, tenantId);
					logger.info(`✅ New demo tenant ${tenantId} seeded successfully.`);
				} catch (e) {
					logger.error(`Failed to seed demo tenant ${tenantId}:`, e);
				}
			} else {
				logger.trace(`Existing demo tenant from cookie: ${tenantId}`);
			}
		} else {
			// Standard multi-tenancy: resolve tenantId from hostname
			tenantId = getTenantIdFromHostname(url.hostname);
		}

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
		metricsService.incrementAuthValidations();

		// Check if auth service is ready before attempting validation
		if (!auth) {
			logger.debug('Auth service not ready during session validation - skipping validation but preserving cookie');
			// Do NOT delete cookie here - allow retry on next request
			return resolve(event);
		}

		const user = await getUserFromSession(sessionId, locals.tenantId);
		if (user) {
			// Tenant isolation check
			if (locals.tenantId && user.tenantId && user.tenantId !== locals.tenantId) {
				logger.warn(`Tenant isolation violation: User ${user._id} (tenant: ${user.tenantId}) tried ${locals.tenantId}`);
				metricsService.incrementAuthFailures();
				cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
				throw error(403, 'Access denied: Tenant isolation violation');
			}

			// Set user in locals
			locals.user = user;
			locals.session_id = sessionId;
			locals.permissions = user.permissions || [];
			logger.trace(`User authenticated: ${user._id}`);

			// Step 3: Automatic session rotation (security enhancement)
			// Rotates session token every 15 minutes for active users
			try {
				await handleSessionRotation(event, user, sessionId);
			} catch (rotationError) {
				// Rotation errors are already handled in handleSessionRotation
				// Just log additional context here if needed
				if (rotationError instanceof Error && !rotationError.message.includes('Session expired')) {
					logger.debug(`Non-critical rotation issue: ${rotationError.message}`);
				}
			}
		} else {
			// Only delete cookie if auth was ready but session was invalid
			// getUserFromSession returns null if session not found/expired OR if auth not ready
			// But we checked !auth above, so here it means session is truly invalid
			metricsService.incrementAuthFailures();
			cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
			logger.trace(`Invalid session removed: ${sessionId.substring(0, 8)}...`);
		}
	}

	return resolve(event);
};

// --- UTILITY EXPORTS ---

/**
 * Invalidate a single session from all cache layers.
 * Use when logging out a user or detecting compromised sessions.
 *
 * @param sessionId - The session ID to invalidate
 * @param tenantId - Optional tenant ID for multi-tenant setups
 */
export function invalidateSessionCache(sessionId: string, tenantId?: string): void {
	sessionCache.delete(sessionId);
	strongRefs.delete(sessionId);
	lastRefreshAttempt.delete(sessionId);
	lastRotationAttempt.delete(sessionId);

	const cacheKey = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
	cacheService.delete(cacheKey, tenantId).catch((err) => logger.warn(`Failed to delete session from Redis: ${err.message}`));

	logger.debug(`Session cache invalidated: ${sessionId.substring(0, 8)}...`);
}

/**
 * Clear session refresh cooldown to allow immediate validation.
 * Useful for testing or forced session validation.
 *
 * @param sessionId - The session ID to clear cooldown for
 */
export function clearSessionRefreshAttempt(sessionId: string): void {
	lastRefreshAttempt.delete(sessionId);
}

/**
 * Force session rotation for a specific session.
 * Useful for security responses or administrative actions.
 *
 * @param sessionId - The session ID to force rotation for
 */
export function forceSessionRotation(sessionId: string): void {
	lastRotationAttempt.delete(sessionId);
	logger.info(`Forced rotation flag set for session ${sessionId.substring(0, 8)}...`);
}

/**
 * Clears all session caches (maintenance only).
 * WARNING: This will force all users to re-authenticate on next request.
 * Only use during maintenance windows or security incidents.
 */
export function clearAllSessionCaches(): void {
	sessionCache.clear();
	strongRefs.clear();
	lastRefreshAttempt.clear();
	lastRotationAttempt.clear();
	logger.warn('⚠️  All session caches cleared - users will need to re-authenticate');
}

/**
 * Get session cache statistics for monitoring.
 * @returns Object containing cache sizes and metrics
 */
export function getSessionCacheStats() {
	return {
		weakRefs: sessionCache.size,
		strongRefs: strongRefs.size,
		pendingRefreshes: lastRefreshAttempt.size,
		pendingRotations: lastRotationAttempt.size,
		maxStrongRefs: MAX_STRONG_REFS
	};
}
