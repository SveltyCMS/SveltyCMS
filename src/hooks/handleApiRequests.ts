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
import { cacheService } from '@src/databases/CacheService';
import { error, type Handle } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';

// Cache TTL for API responses (centralized)
import { API_CACHE_TTL_S } from '@src/databases/CacheService';

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

		// no-op

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
			// Tenant-aware key via CacheService tenant prefixing
			const baseKey = `api:${apiEndpoint}:${locals.user._id}:${url.search}`;

			try {
				const cached = await cacheService.get<{
					data: unknown;
					headers: Record<string, string>;
				}>(baseKey, locals.tenantId);

				if (cached) {
					logger.debug(`Cache hit for API GET \x1b[34m${baseKey}\x1b[0m (tenant: ${locals.tenantId || 'global'})`);
					healthMetrics.cache.hits++;
					return new Response(JSON.stringify(cached.data), {
						status: 200,
						headers: { ...cached.headers, 'Content-Type': 'application/json', 'X-Cache': 'hit' }
					});
				}
			} catch (cacheGetError) {
				logger.warn(`Error fetching from API cache for \x1b[31m${baseKey}\x1b[0m: ${cacheGetError.message}`);
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
					await cacheService.set(
						baseKey,
						{
							data: responseBody,
							headers: Object.fromEntries(response.headers)
						},
						API_CACHE_TTL_S,
						locals.tenantId
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
			const baseKey = `api:${apiEndpoint}:${locals.user._id}`;
			try {
				// Clear tenant-scoped keys for this endpoint/user
				await cacheService.clearByPattern(`${baseKey}:*`, locals.tenantId);
				await cacheService.delete(baseKey, locals.tenantId);
				logger.debug(
					`Invalidated API cache for keys starting with \x1b[34m${baseKey}:*\x1b[0m (tenant: ${locals.tenantId || 'global'}) after \x1b[32m${event.request.method}\x1b[0m request`
				);
			} catch (err) {
				logger.error(`Failed to invalidate API cache for ${baseKey}: ${err.message}`);
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
	const baseKey = `api:${apiEndpoint}:${userId}`;
	logger.debug(
		`Attempting to invalidate API cache for pattern \x1b[33m${baseKey}:*\x1b[0m (tenant: ${tenantId || 'global'}) and exact key \x1b[33m${baseKey}\x1b[0m`
	);

	try {
		await cacheService.clearByPattern(`${baseKey}:*`, tenantId);
		await cacheService.delete(baseKey, tenantId);
	} catch (e) {
		logger.error(`Error during explicit API cache invalidation for \x1b[31m${baseKey}\x1b[0m: ${e.message}`);
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
