/**
 * @file src/hooks/handleApiRequests.ts
 * @description Middleware for API request authorization and intelligent caching
 *
 * ### Responsibilities
 * - Enforces role-based API access control using permission rules
 * - Implements tenant-aware response caching for GET requests
 * - Automatically invalidates caches on mutations (POST/PUT/DELETE/PATCH)
 * - Tracks performance metrics (cache hits, misses, errors)
 * - Handles cache bypass with query parameters
 *
 * ### Caching Strategy
 * - **Cached**: Successful GET requests (per user, per tenant, per endpoint)
 * - **Not Cached**: GraphQL queries (complex caching handled separately)
 * - **Bypass**: Add `?refresh=true` or `?nocache=true` to skip cache
 * - **Invalidation**: Automatic on mutations, manual via `invalidateApiCache()`
 *
 * ### Prerequisites
 * - handleSystemState confirmed system is READY
 * - handleAuthentication validated session and set locals.user
 * - handleAuthorization loaded roles and permissions
 *
 * @prerequisite User authentication and authorization are complete
 */

import { error, type Handle } from '@sveltejs/kit';
import { getErrorMessage } from '@utils/errorHandling';
import { hasApiPermission } from '@src/databases/auth/apiPermissions';
import { cacheService, API_CACHE_TTL_S } from '@src/databases/CacheService';
// System Logger
import { logger } from '@utils/logger.svelte';

// --- HEALTH METRICS ---

/**
 * Tracks API performance and usage statistics.
 * Reset periodically to prevent memory growth.
 */
let healthMetrics = {
	cache: { hits: 0, misses: 0 },
	requests: { total: 0, errors: 0 }
};

// --- UTILITY FUNCTIONS ---

/**
 * Extracts the API endpoint from the URL pathname.
 *
 * @example
 * getApiEndpoint('/api/settings/system') // 'settings'
 * getApiEndpoint('/api/user/profile') // 'user'
 */
function getApiEndpoint(pathname: string): string | null {
	const parts = pathname.split('/api/')[1]?.split('/');
	return parts?.[0] || null;
}

/**
 * Generates a cache key for API responses.
 * Includes user ID, endpoint, and full query to ensure uniqueness.
 */
function generateCacheKey(pathname: string, search: string, userId: string): string {
	return `api:${userId}:${pathname}${search}`;
}

/**
 * Checks if cache should be bypassed based on query parameters.
 */
function shouldBypassCache(searchParams: URLSearchParams): boolean {
	return searchParams.get('refresh') === 'true' || searchParams.get('nocache') === 'true';
}

// --- MAIN HOOK ---

export const handleApiRequests: Handle = async ({ event, resolve }) => {
	const { url, locals, request } = event;

	// Early exit for non-API routes or unauthenticated requests
	if (!url.pathname.startsWith('/api/') || !locals.user) {
		return resolve(event);
	}

	healthMetrics.requests.total++;

	try {
		const apiEndpoint = getApiEndpoint(url.pathname);

		if (!apiEndpoint) {
			logger.warn(`Invalid API path: \x1b[33m${url.pathname}\x1b[0m`);
			throw error(400, 'Invalid API path');
		}

		// --- 1. Authorization Check ---
		// Special case: logout endpoint is always allowed
		if (url.pathname === '/api/user/logout') {
			logger.trace('Logout endpoint - bypassing permission checks');
			return resolve(event);
		}

		// Check if user's role has permission to access this API endpoint
		if (!hasApiPermission(locals.user.role, apiEndpoint)) {
			logger.warn(
				`User \x1b[34m${locals.user._id}\x1b[0m (role: ${locals.user.role}, tenant: ${locals.tenantId || 'global'}) ` +
					`denied access to\x1b[33m/api/${apiEndpoint}\x1b[0m - insufficient permissions`
			);
			throw error(403, `Forbidden: Your role (${locals.user.role}) does not have permission to access this API endpoint.`);
		}

		logger.trace(`User \x1b[34m${locals.user._id}\x1b[0m granted access to \x1b[33m/api/${apiEndpoint}\x1b[0m`, {
			role: locals.user.role,
			tenant: locals.tenantId || 'global'
		});

		// --- 2. Handle GET Requests with Caching ---
		if (request.method === 'GET') {
			const bypassCache = shouldBypassCache(url.searchParams);
			const cacheKey = generateCacheKey(url.pathname, url.search, locals.user._id);

			// Try to serve from cache (unless bypassed)
			if (!bypassCache) {
				try {
					const cached = await cacheService.get<{
						data: unknown;
						headers: Record<string, string>;
					}>(cacheKey, locals.tenantId);

					if (cached) {
						logger.debug(`Cache hit for API GET \x1b[33m${url.pathname}\x1b[0m (tenant: ${locals.tenantId || 'global'})`);
						healthMetrics.cache.hits++;

						return new Response(JSON.stringify(cached.data), {
							status: 200,
							headers: {
								...cached.headers,
								'Content-Type': 'application/json',
								'X-Cache': 'HIT'
							}
						});
					}
				} catch (cacheError) {
					logger.warn(`Cache read error for \x1b[31m${cacheKey}\x1b[0m: ${getErrorMessage(cacheError)}`);
					// Continue to resolve request if cache fails
				}
			} else {
				logger.debug(`Cache bypass requested for \x1b[33m${url.pathname}\x1b[0m`);
			}

			// Resolve the request (cache miss or bypassed)
			const response = await resolve(event);

			// Special case: GraphQL has its own caching logic
			if (apiEndpoint === 'graphql') {
				const newHeaders = new Headers(response.headers);
				newHeaders.set('X-Cache', 'BYPASS');
				healthMetrics.cache.misses++;

				return new Response(response.body, {
					status: response.status,
					headers: newHeaders
				});
			}

			// Cache successful responses
			if (response.ok) {
				try {
					const responseBody = await response.text();
					const responseData = JSON.parse(responseBody);

					await cacheService.set(
						cacheKey,
						{
							data: responseData,
							headers: Object.fromEntries(response.headers)
						},
						API_CACHE_TTL_S,
						locals.tenantId
					);

					healthMetrics.cache.misses++;

					return new Response(responseBody, {
						status: response.status,
						headers: {
							...Object.fromEntries(response.headers),
							'Content-Type': 'application/json',
							'X-Cache': 'MISS'
						}
					});
				} catch (processingError) {
					logger.error(`Error caching API response for \x1b[34m/api/${apiEndpoint}\x1b[0m: ${getErrorMessage(processingError)}`);
					// Return the original response if caching fails
					return response;
				}
			}

			return response;
		}

		// --- 3. Handle Mutations (POST, PUT, DELETE, PATCH) ---
		const response = await resolve(event);

		// Invalidate cache on successful mutations
		if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && response.ok) {
			try {
				// Invalidate all cached responses for this endpoint and user
				const patternToInvalidate = `api:${locals.user._id}:/api/${apiEndpoint}`;

				await cacheService.clearByPattern(`${patternToInvalidate}*`, locals.tenantId);

				logger.debug(
					`Invalidated API cache for pattern ${patternToInvalidate}* ` + `(tenant: ${locals.tenantId || 'global'}) after ${request.method} request`
				);
			} catch (invalidationError) {
				logger.error(`Failed to invalidate API cache after ${request.method}: ${getErrorMessage(invalidationError)}`);
				// Don't fail the request if cache invalidation fails
			}
		}

		return response;
	} catch (err) {
		healthMetrics.requests.errors++;
		// Re-throw to let SvelteKit's error handler deal with it
		throw err;
	}
};

// --- UTILITY EXPORTS ---

/**
 * Manually invalidates API cache for a specific endpoint and user.
 * Useful when you need to clear cache outside of the normal request flow.
 *
 * @param apiEndpoint - The API endpoint to invalidate (e.g., 'settings', 'user')
 * @param userId - The user ID whose cache should be cleared
 * @param tenantId - Optional tenant ID for multi-tenant systems
 *
 * @example
 * // Clear all cached settings API responses for a user
 * await invalidateApiCache('settings', user._id, tenantId);
 */
export async function invalidateApiCache(apiEndpoint: string, userId: string, tenantId?: string): Promise<void> {
	const baseKey = `api:${userId}:/api/${apiEndpoint}`;

	logger.debug(`Manually invalidating API cache for pattern \x1b[31m${baseKey}\x1b[0m* ` + `(tenant: ${tenantId || 'global'})`);

	try {
		await cacheService.clearByPattern(`${baseKey}*`, tenantId);
		await cacheService.delete(baseKey, tenantId);
	} catch (err) {
		logger.error(`Error during manual API cache invalidation for \x1b[31m${baseKey}\x1b[0m: ${getErrorMessage(err)}`);
	}
}

/**
 * Returns a snapshot of current API health metrics.
 * Useful for monitoring and debugging.
 */
export function getApiHealthMetrics() {
	return { ...healthMetrics };
}

/**
 * Resets all API health metrics to zero.
 * Should be called periodically (e.g., every hour) to prevent memory growth.
 */
export function resetApiHealthMetrics(): void {
	healthMetrics = {
		cache: { hits: 0, misses: 0 },
		requests: { total: 0, errors: 0 }
	};
	logger.trace('API health metrics reset');
}
