/**
 * @file src/hooks/handleApiRequests.ts
 * @description Handles API request processing with tenant-aware caching and permissions
 *
 * Features:
 * - Tenant-aware API caching
 * - Permission-based access control
 * - Cache invalidation on mutations
 * - Performance monitoring
 * - Error handling and logging
 */

import { hasApiPermission } from '@src/auth/apiPermissions';
import { getCacheStore } from '@src/cacheStore/index.server';
import { logger } from '@utils/logger.svelte';
import { error, type Handle } from '@sveltejs/kit';

// Cache TTL for API responses
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Health metrics for monitoring
let healthMetrics = {
	cache: { hits: 0, misses: 0 },
	requests: { total: 0, errors: 0 }
};

export const handleApiRequests: Handle = async ({ event, resolve }) => {
	const { url, locals } = event;

	// Only process API requests with authenticated users
	if (!url.pathname.startsWith('/api/') || !locals.user) {
		return resolve(event);
	}

	healthMetrics.requests.total++;

	try {
		const apiEndpoint = url.pathname.split('/api/')[1]?.split('/')[0];
		if (!apiEndpoint) {
			logger.warn(`Could not determine API endpoint from path: ${url.pathname}`);
			throw error(400, 'Invalid API path');
		}

		// SPECIAL CASE: Logout should always be allowed regardless of permissions
		if (url.pathname === '/api/user/logout') {
			logger.debug('Logout endpoint accessed - bypassing permission checks');
			return resolve(event);
		}

		const cacheStore = getCacheStore();
		const now = Date.now();

		// Check if user role has permission to access this API endpoint
		if (!hasApiPermission(locals.user.role, apiEndpoint)) {
			logger.warn(
				`User \x1b[34m${locals.user._id}\x1b[0m (role: ${locals.user.role}, tenant: ${locals.tenantId || 'global'}) denied access to API /api/${apiEndpoint} due to insufficient role permissions`
			);
			throw error(403, `Forbidden: Your role (${locals.user.role}) does not have permission to access this API endpoint.`);
		}

		logger.debug(`User granted access to API`, {
			email: locals.user.email || locals.user._id,
			role: locals.user.role,
			apiEndpoint: `/api/${apiEndpoint}`,
			tenant: locals.tenantId || 'global'
		});

		// Handle GET requests with tenant-aware caching
		if (event.request.method === 'GET') {
			const cacheKey = `api:${apiEndpoint}:${locals.user._id}:${locals.tenantId || 'global'}:${url.search}`;

			try {
				const cached = await cacheStore.get<{
					data: unknown;
					timestamp: number;
					headers: Record<string, string>;
				}>(cacheKey);

				if (cached && now - cached.timestamp < API_CACHE_TTL) {
					logger.debug(`Cache hit for API GET \x1b[34m${cacheKey}\x1b[0m`);
					healthMetrics.cache.hits++;
					return new Response(JSON.stringify(cached.data), {
						status: 200,
						headers: { ...cached.headers, 'Content-Type': 'application/json', 'X-Cache': 'hit' }
					});
				}
			} catch (cacheGetError) {
				logger.warn(`Error fetching from API cache for \x1b[31m${cacheKey}\x1b[0m: ${cacheGetError.message}`);
			}

			const response = await resolve(event);

			// GraphQL might have its own complex caching
			if (apiEndpoint === 'graphql') {
				response.headers.append('X-Cache', 'miss');
				healthMetrics.cache.misses++;
				return response;
			}

			if (response.ok) {
				try {
					const responseBody = await response.json();
					await cacheStore.set(
						cacheKey,
						{
							data: responseBody,
							timestamp: now,
							headers: Object.fromEntries(response.headers)
						},
						new Date(now + API_CACHE_TTL)
					);
					healthMetrics.cache.misses++;

					// Return a new Response with the updated headers
					return new Response(JSON.stringify(responseBody), {
						status: response.status,
						headers: {
							...Object.fromEntries(response.headers),
							'Content-Type': 'application/json',
							'X-Cache': 'miss'
						}
					});
				} catch (processingError) {
					logger.error(
						`Error processing API GET response for \x1b[34m/api/${apiEndpoint}\x1b[0m (user: \x1b[31m${locals.user._id}\x1b[0m, tenant: ${locals.tenantId || 'global'}): ${processingError.message}`
					);
					throw error(500, 'Failed to process API response');
				}
			}
			return response;
		}

		// Handle non-GET requests (POST, PUT, DELETE etc.) with tenant-aware cache invalidation
		const response = await resolve(event);

		if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(event.request.method) && response.ok) {
			const baseCacheKey = `api:${apiEndpoint}:${locals.user._id}:${locals.tenantId || 'global'}`;
			try {
				// Try to delete pattern-based cache keys if supported
				if (typeof cacheStore.deletePattern === 'function') {
					await cacheStore.deletePattern(`${baseCacheKey}:*`);
				}
				await cacheStore.delete(baseCacheKey);
				logger.debug(
					`Invalidated API cache for keys starting with \x1b[34m${baseCacheKey}\x1b[0m after \x1b[32m${event.request.method}\x1b[0m request`
				);
			} catch (err) {
				logger.error(`Failed to invalidate API cache for ${baseCacheKey}: ${err.message}`);
			}
		}
		return response;
	} catch (err) {
		healthMetrics.requests.errors++;
		throw err;
	}
};

/**
 * Helper function to invalidate API cache with tenant awareness
 */
export const invalidateApiCache = async (apiEndpoint: string, userId: string, tenantId?: string): Promise<void> => {
	const cacheStore = getCacheStore();
	const basePattern = `api:${apiEndpoint}:${userId}:${tenantId || 'global'}`;
	logger.debug(`Attempting to invalidate API cache for pattern \x1b[33m${basePattern}:*\x1b[0m and exact key \x1b[33m${basePattern}\x1b[0m`);

	try {
		// Try to delete pattern-based cache keys if supported
		if (typeof cacheStore.deletePattern === 'function') {
			await cacheStore.deletePattern(`${basePattern}:*`);
		}
		await cacheStore.delete(basePattern);
	} catch (e) {
		logger.error(`Error during explicit API cache invalidation for \x1b[31m${basePattern}\x1b[0m: ${e.message}`);
	}
};

/**
 * Get API health metrics
 */
export const getApiHealthMetrics = () => ({ ...healthMetrics });

/**
 * Reset API health metrics
 */
export const resetApiHealthMetrics = () => {
	healthMetrics = {
		cache: { hits: 0, misses: 0 },
		requests: { total: 0, errors: 0 }
	};
};
