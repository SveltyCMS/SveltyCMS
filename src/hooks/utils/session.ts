/**
 * @file src/hooks/utils/session.ts
 * @description Shared session utilities for authentication across hooks
 */

import type { User } from '@src/databases/auth/types';
import { SESSION_CACHE_TTL_MS as CACHE_TTL_MS, cacheService } from '@src/databases/CacheService';
import { getPrivateSetting } from '@src/services/settingsService';
import type { RequestEvent } from '@sveltejs/kit';
import type { RateLimiter } from 'sveltekit-rate-limiter/server';

// System Logger
import { logger } from '@utils/logger.svelte';

// Session caches and metrics shared across hooks
export const sessionCache = new Map<string, { user: User; timestamp: number }>();
export const sessionMetrics = {
	lastActivity: new Map<string, number>(),
	activeExtensions: new Map<string, number>(),
	rotationAttempts: new Map<string, number>()
};

// Debounce map for rotation attempts
const lastRefreshAttempt = new Map<string, number>();

// Deduplicate helper
const pendingOperations = new Map<string, Promise<unknown>>();
async function deduplicate<T>(key: string, operation: () => Promise<T>): Promise<T> {
	if (pendingOperations.has(key)) {
		return pendingOperations.get(key) as Promise<T>;
	}
	const promise = operation().finally(() => pendingOperations.delete(key));
	pendingOperations.set(key, promise);
	return promise;
}

export async function getUserFromSessionId(
	session_id: string | undefined,
	authServiceReady: boolean = false,
	tenantId: string | undefined,
	authService: { validateSession: (id: string) => Promise<User | null> } | null
): Promise<User | null> {
	if (!session_id) return null;
	const now = Date.now();
	const canUseCache = authServiceReady || authService !== null;

	// Load multi-tenant setting once
	const isMultiTenant = await getPrivateSetting('MULTI_TENANT');

	const validateUserTenant = (user: User): User | null => {
		if (isMultiTenant && tenantId && user.tenantId !== tenantId) {
			logger.warn(`Session user's tenant ('${user.tenantId}') does not match request tenant ('${tenantId}'). Access denied.`);
			return null;
		}
		return user;
	};

	// In-memory cache first
	const memCached = sessionCache.get(session_id);
	if (memCached && now - memCached.timestamp < CACHE_TTL_MS && canUseCache) {
		const validUser = validateUserTenant(memCached.user);
		if (!validUser) return null;
		const sessionData = { user: memCached.user, timestamp: now };
		sessionCache.set(session_id, sessionData);
		cacheService
			.set(session_id, sessionData, Math.ceil(CACHE_TTL_MS / 1000))
			.catch((err) => logger.error(`Failed to extend session cache for ${session_id}: ${err.message}`));
		sessionMetrics.lastActivity.set(session_id, now);
		return memCached.user;
	}

	// Distributed cache
	if (canUseCache) {
		try {
			const redisCached = await cacheService.get<{ user: User; timestamp: number }>(session_id);
			if (redisCached && now - redisCached.timestamp < CACHE_TTL_MS) {
				const validUser = validateUserTenant(redisCached.user);
				if (!validUser) return null;
				sessionCache.set(session_id, redisCached);
				sessionMetrics.lastActivity.set(session_id, now);
				return redisCached.user;
			}
		} catch (cacheError) {
			const errorMsg =
				typeof cacheError === 'object' && cacheError !== null && 'message' in cacheError
					? (cacheError as { message: string }).message
					: String(cacheError);
			logger.error(`Error reading from session cache store for ${session_id}: ${errorMsg}`);
		}
	}

	// DB validation
	if (!authServiceReady || !authService) {
		logger.debug(`Auth service not ready, skipping session validation for \x1b[32m${session_id}\x1b[0m`);
		return null;
	}

	try {
		const user = await deduplicate(`validateSession:${session_id}`, () => authService.validateSession(session_id));
		if (!user) return null;
		const validUser = validateUserTenant(user);
		if (!validUser) return null;
		const sessionData = { user: validUser, timestamp: now };
		sessionCache.set(session_id, sessionData);
		await cacheService.set(session_id, sessionData, Math.ceil(CACHE_TTL_MS / 1000));
		sessionMetrics.lastActivity.set(session_id, now);
		return validUser;
	} catch (dbError) {
		const errorMsg =
			typeof dbError === 'object' && dbError !== null && 'message' in dbError ? (dbError as { message: string }).message : String(dbError);
		logger.error(`Session validation DB error for ${session_id}: ${errorMsg}`);
		return null;
	}
}

export async function handleSessionRotation(
	event: RequestEvent,
	user: User,
	session_id: string,
	authService: {
		getSessionTokenData: (id: string) => Promise<{ expiresAt: Date; user_id: string } | null>;
		rotateToken: (id: string, newExpiry: Date) => Promise<string | null>;
	},
	refreshLimiter: RateLimiter,
	cookieName: string
): Promise<string> {
	if (!user || !user._id) {
		logger.error(
			`CRITICAL: handleSessionRotation called with invalid user for session ${session_id}. User: ${JSON.stringify(user)}. Invalidating session.`
		);
		event.cookies.delete(cookieName, { path: '/' });
		throw new Error('invalid-session');
	}
	// Get token data and determine if rotation is needed
	let tokenData: { expiresAt: Date; user_id: string } | null = null;
	try {
		tokenData = await authService.getSessionTokenData(session_id);
		if (!tokenData) {
			logger.error(`Failed to get session token data for session ${session_id}`);
			event.cookies.delete(cookieName, { path: '/' });
			throw new Error('invalid-session');
		}
	} catch (tokenError) {
		const errorMsg =
			typeof tokenError === 'object' && tokenError !== null && 'message' in tokenError
				? (tokenError as { message: string }).message
				: String(tokenError);
		logger.error(`Error getting session token data for ${session_id}: ${errorMsg}`);
		event.cookies.delete(cookieName, { path: '/' });
		throw new Error('invalid-session');
	}

	if (tokenData && tokenData.user_id === user._id) {
		const now = Date.now();
		const expiresAtTime = new Date(tokenData.expiresAt).getTime();
		const timeLeft = expiresAtTime - now;
		const shouldRefresh = timeLeft > 0 && timeLeft < 60 * 60 * 1000; // Less than 1 hour left
		const REFRESH_DEBOUNCE_MS = 5 * 60 * 1000;
		const lastAttempt = lastRefreshAttempt.get(session_id) || 0;
		if (shouldRefresh && now - lastAttempt > REFRESH_DEBOUNCE_MS) {
			// Check rate limit BEFORE attempting rotation
			if (await refreshLimiter.isLimited(event)) {
				logger.debug(`Refresh rate limit hit for user ${user._id}, skipping rotation for now`);
				return session_id; // Skip rotation but don't error
			}

			lastRefreshAttempt.set(session_id, now);
			sessionMetrics.rotationAttempts.set(session_id, (sessionMetrics.rotationAttempts.get(session_id) || 0) + 1);

			try {
				const oldSessionId = session_id;
				const newExpiryDate = new Date(now + CACHE_TTL_MS);
				const newTokenId = await authService.rotateToken(session_id, newExpiryDate);
				if (!newTokenId) {
					logger.error(`Token rotation returned null for session ${session_id}`);
					return session_id;
				}
				session_id = newTokenId;
				const sessionData = { user, timestamp: now };
				sessionCache.set(newTokenId, sessionData);
				await cacheService.set(newTokenId, sessionData, Math.ceil(CACHE_TTL_MS / 1000));
				sessionCache.delete(oldSessionId);
				cacheService.delete(oldSessionId).catch((err) => logger.warn(`Failed to delete old session ${oldSessionId} from cache: ${err.message}`));
				event.cookies.set(cookieName, session_id, {
					path: '/',
					httpOnly: true,
					secure: event.url.protocol === 'https:',
					maxAge: CACHE_TTL_MS / 1000,
					sameSite: 'lax'
				});
				logger.debug(`Token rotated for user ${user._id}. Old: ${oldSessionId}, New: ${newTokenId}`);
			} catch (rotationError) {
				const rotationErrorMsg =
					typeof rotationError === 'object' && rotationError !== null && 'message' in rotationError
						? (rotationError as { message: string }).message
						: String(rotationError);
				logger.error(`Token rotation failed for user ${user._id}, session ${session_id}: ${rotationErrorMsg}`);
			}
		}
	} else if (tokenData && tokenData.user_id !== user._id) {
		logger.error(`CRITICAL: Session ID ${session_id} for user ${user._id} resolved to different user ${tokenData.user_id}. Invalidating session.`);
		event.cookies.delete(cookieName, { path: '/' });
		throw new Error('invalid-session');
	} else if (!tokenData && session_id) {
		logger.warn(`Session ${session_id} for user ${user._id} yielded no valid tokenData. Clearing cookie.`);
		event.cookies.delete(cookieName, { path: '/' });
	}
	return session_id;
}
