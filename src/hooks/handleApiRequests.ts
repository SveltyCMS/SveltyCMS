/**
 * @file src/hooks/handleApiRequests.ts
 * @description Middleware for API request authorization and intelligent caching with streaming optimization
 *
 * ### Responsibilities
 * - Enforces role-based API access control using permission rules
 * - Implements tenant-aware response caching for GET requests
 * - Automatically invalidates caches on mutations (POST/PUT/DELETE/PATCH)
 * - Tracks performance metrics (cache hits, misses, errors)
 * - Handles cache bypass with query parameters
 * - Optimizes streaming performance by using response clones
 *
 * ### Caching Strategy
 * - **Cached**: Successful GET requests (per user, per tenant, per endpoint)
 * - **Not Cached**: GraphQL queries (complex caching handled separately)
 * - **Bypass**: Add `?refresh=true` or `?nocache=true` to skip cache
 * - **Invalidation**: Automatic on mutations, manual via `invalidateApiCache()`
 *
 * ### Performance Optimizations
 * - Uses response.clone() to avoid blocking streaming for large responses
 * - Background cache population doesn't delay response to client
 * - Minimal memory overhead for large payloads
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
import { metricsService } from '@src/services/MetricsService';
import { logger } from '@utils/logger.server';

// --- METRICS INTEGRATION ---
// API metrics are now handled by the unified MetricsService for enterprise-grade monitoring

/** Extracts the API endpoint from the URL pathname. */
function getApiEndpoint(pathname: string): string | null {
	const parts = pathname.split('/api/')[1]?.split('/');
	return parts?.[0] || null;
}

/** Generates a cache key for API responses. */
function generateCacheKey(pathname: string, search: string, userId: string): string {
	return `api:${userId}:${pathname}${search}`;
}

/** Checks if cache should be bypassed based on query parameters. */
function shouldBypassCache(searchParams: URLSearchParams): boolean {
	return searchParams.get('refresh') === 'true' || searchParams.get('nocache') === 'true';
}

// --- MAIN HOOK ---

export const handleApiRequests: Handle = async ({ event, resolve }) => {
	const { url, locals, request } = event;

	// Early exit for non-API routes
	if (!url.pathname.startsWith('/api/')) {
		return resolve(event);
	}

	// Skip authentication check for setup API routes
	// These are handled by handleSetup middleware for access control
	if (url.pathname.startsWith('/api/setup')) {
		return resolve(event);
	}

	// Allow public API endpoints without authentication
	// - /api/system/version: Version check for login page
	if (url.pathname === '/api/system/version') {
		return resolve(event);
	}

	// Require authentication for all other API routes
	if (!locals.user) {
		logger.warn(`Unauthenticated API access attempt: ${url.pathname}`);
		throw error(401, 'Authentication required');
	}

	metricsService.incrementApiRequests();

	try {
		const apiEndpoint = getApiEndpoint(url.pathname);

		if (!apiEndpoint) {
			logger.warn(`Invalid API path: ${url.pathname}`);
			throw error(400, 'Invalid API path');
		}

		// --- 1. Authorization Check ---
		if (url.pathname === '/api/user/logout') {
			logger.trace('Logout endpoint - bypassing permission checks');
			return resolve(event);
		}

		if (!hasApiPermission(locals.user.role, apiEndpoint)) {
			logger.warn(
				`User ${locals.user._id} (role: ${locals.user.role}, tenant: ${locals.tenantId || 'global'}) ` +
					`denied access to /api/${apiEndpoint} - insufficient permissions`
			);
			throw error(403, `Forbidden: Your role (${locals.user.role}) does not have permission to access this API endpoint.`);
		}

		logger.trace(`User ${locals.user._id} granted access to /api/${apiEndpoint}`, {
			role: locals.user.role,
			tenant: locals.tenantId || 'global'
		});

		// --- 2. Handle GET Requests with Caching ---
		if (request.method === 'GET') {
			const bypassCache = shouldBypassCache(url.searchParams);
			const cacheKey = generateCacheKey(url.pathname, url.search, locals.user._id);

			if (!bypassCache) {
				try {
					const cached = await cacheService.get<{
						data: unknown;
						headers: Record<string, string>;
					}>(cacheKey, locals.tenantId);

					if (cached) {
						logger.debug(`Cache hit for API GET ${url.pathname} (tenant: ${locals.tenantId || 'global'})`);
						metricsService.recordApiCacheHit();
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
					logger.warn(`Cache read error for ${cacheKey}: ${getErrorMessage(cacheError)}`);
				}
			} else {
				logger.debug(`Cache bypass requested for ${url.pathname}`);
			} // Resolve the request (cache miss or bypassed)
			const response = await resolve(event);

			// --- OPTIMIZED: GraphQL bypass, no new Response created ---
			if (apiEndpoint === 'graphql') {
				response.headers.set('X-Cache', 'BYPASS');
				metricsService.recordApiCacheMiss();
				return response;
			}

			// --- STREAMING OPTIMIZATION: Cache successful responses without blocking ---
			if (response.ok) {
				metricsService.recordApiCacheMiss();

				// Clone the response to read body without consuming the original stream
				const responseClone = response.clone();

				// Set cache header immediately
				response.headers.set('X-Cache', 'MISS');

				// Cache in background - don't await to avoid blocking the response stream
				// This is especially important for large payloads (e.g., file downloads, large JSON)
				(async () => {
					try {
						const responseBody = await responseClone.text();
						const responseData = JSON.parse(responseBody);

						await cacheService.set(
							cacheKey,
							{
								data: responseData,
								headers: Object.fromEntries(responseClone.headers)
							},
							API_CACHE_TTL_S,
							locals.tenantId
						);

						logger.trace(`Background cache set complete for ${url.pathname}`);
					} catch (processingError) {
						// Only log JSON parse errors if response is expected to be JSON
						const contentType = responseClone.headers.get('content-type');
						if (contentType?.includes('application/json')) {
							logger.error(`Error caching API response for /api/${apiEndpoint}: ${getErrorMessage(processingError)}`);
						} else {
							logger.trace(`Skipped caching non-JSON response for /api/${apiEndpoint}`);
						}
					}
				})();

				// Return original response immediately (streaming not blocked)
				return response;
			}

			return response;
		}

		// --- 3. Handle Mutations (POST, PUT, DELETE, PATCH) ---
		const response = await resolve(event);

		if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && response.ok) {
			try {
				const patternToInvalidate = `api:${locals.user._id}:/api/${apiEndpoint}`;
				await cacheService.clearByPattern(`${patternToInvalidate}*`, locals.tenantId);

				logger.debug(
					`Invalidated API cache for pattern ${patternToInvalidate}* (tenant: ${locals.tenantId || 'global'}) after ${request.method} request`
				);
			} catch (invalidationError) {
				logger.error(`Failed to invalidate API cache after ${request.method}: ${getErrorMessage(invalidationError)}`);
			}
		}

		return response;
	} catch (err) {
		metricsService.incrementApiErrors();
		throw err;
	}
};

// --- UTILITY EXPORTS ---

/** Manually invalidates API cache for a specific endpoint and user. */
export async function invalidateApiCache(apiEndpoint: string, userId: string, tenantId?: string): Promise<void> {
	const baseKey = `api:${userId}:/api/${apiEndpoint}`;
	logger.debug(`Manually invalidating API cache for pattern ${baseKey}* (tenant: ${tenantId || 'global'})`);

	try {
		await cacheService.clearByPattern(`${baseKey}*`, tenantId);
		await cacheService.delete(baseKey, tenantId);
	} catch (err) {
		logger.error(`Error during manual API cache invalidation for ${baseKey}: ${getErrorMessage(err)}`);
	}
}

/** Returns API metrics from the unified metrics service. */
export function getApiHealthMetrics() {
	const report = metricsService.getReport();
	return {
		cache: {
			hits: report.api.cacheHits,
			misses: report.api.cacheMisses,
			hitRate: report.api.cacheHitRate
		},
		requests: {
			total: report.api.requests,
			errors: report.api.errors
		}
	};
}

/** API metrics are now managed by the unified MetricsService. */
export function resetApiHealthMetrics(): void {
	logger.trace('API health metrics managed by unified MetricsService');
}
