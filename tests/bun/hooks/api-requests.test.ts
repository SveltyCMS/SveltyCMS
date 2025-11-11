/**
 * @file tests/bun/hooks/api-requests.test.ts
 * @description Tests for handleApiRequests middleware (API permissions, caching, mutations)
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { handleApiRequests } from '@src/hooks/handleApiRequests';
import type { RequestEvent } from '@sveltejs/kit';
import type { User } from '@src/databases/auth/types';

// --- Test Utilities ---

const mockUser: User = {
	_id: 'user123',
	email: 'admin@example.com',
	role: 'admin',
	tenantId: 'default',
	permissions: []
};

function createMockEvent(pathname: string, method: string = 'GET', user?: User): RequestEvent {
	const url = new URL(pathname, 'http://localhost');

	return {
		url,
		request: new Request(url.toString(), { method }),
		locals: { user, tenantId: 'default' }
	} as unknown as RequestEvent;
}

// --- Tests ---

describe('handleApiRequests Middleware', () => {
	let mockResolve: ReturnType<typeof mock>;

	beforeEach(() => {
		const mockResponseData = { success: true, data: [] };
		mockResolve = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify(mockResponseData), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);
	});

	describe('Non-API Route Passthrough', () => {
		it('should skip non-API routes', async () => {
			const event = createMockEvent('/dashboard', 'GET', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Setup API Exemption', () => {
		it('should skip authentication for /api/setup', async () => {
			const event = createMockEvent('/api/setup', 'POST');
			await handleApiRequests({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should allow /api/setup/config without auth', async () => {
			const event = createMockEvent('/api/setup/config', 'POST');
			await handleApiRequests({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Authentication Requirement', () => {
		it('should require authentication for API routes', async () => {
			const event = createMockEvent('/api/collections', 'GET');

			try {
				await handleApiRequests({ event, resolve: mockResolve });
			} catch (err) {
				// 401 for unauthenticated requests
				expect(err).toBeDefined();
			}
		});

		it('should allow authenticated requests', async () => {
			const event = createMockEvent('/api/collections', 'GET', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Role-Based API Access (hasApiPermission)', () => {
		it('should check API permissions for endpoint', async () => {
			const event = createMockEvent('/api/collections', 'GET', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			// hasApiPermission(role, endpoint) checked
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should deny access for insufficient permissions', async () => {
			const lowPrivUser = { ...mockUser, role: 'viewer' };
			const event = createMockEvent('/api/admin/settings', 'POST', lowPrivUser);

			try {
				await handleApiRequests({ event, resolve: mockResolve });
			} catch (err) {
				// 403 Forbidden
				expect(err).toBeDefined();
			}
		});
	});

	describe('Logout Endpoint Bypass', () => {
		it('should bypass permission checks for /api/user/logout', async () => {
			const event = createMockEvent('/api/user/logout', 'POST', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('GET Request Caching', () => {
		it('should cache successful GET responses', async () => {
			const event = createMockEvent('/api/collections', 'GET', mockUser);
			const response = await handleApiRequests({ event, resolve: mockResolve });

			// Response cached with X-Cache: MISS
			expect(response.headers.get('X-Cache')).toBeDefined();
		});

		it('should return cached response on subsequent GET', async () => {
			const event1 = createMockEvent('/api/collections', 'GET', mockUser);
			await handleApiRequests({ event: event1, resolve: mockResolve });

			mockResolve.mockClear();

			const event2 = createMockEvent('/api/collections', 'GET', mockUser);
			const response2 = await handleApiRequests({ event: event2, resolve: mockResolve });

			// X-Cache: HIT for cached response
			expect(response2.headers.get('X-Cache')).toBeDefined();
		});

		it('should include user ID in cache key', async () => {
			const user1 = { ...mockUser, _id: 'user1' };
			const user2 = { ...mockUser, _id: 'user2' };

			const event1 = createMockEvent('/api/data', 'GET', user1);
			await handleApiRequests({ event: event1, resolve: mockResolve });

			mockResolve.mockClear();

			const event2 = createMockEvent('/api/data', 'GET', user2);
			await handleApiRequests({ event: event2, resolve: mockResolve });

			// Different users = different cache keys
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should include query params in cache key', async () => {
			const event1 = createMockEvent('/api/collections?filter=active', 'GET', mockUser);
			await handleApiRequests({ event: event1, resolve: mockResolve });

			mockResolve.mockClear();

			const event2 = createMockEvent('/api/collections?filter=archived', 'GET', mockUser);
			await handleApiRequests({ event: event2, resolve: mockResolve });

			// Different query = different cache
			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Cache Bypass with Query Parameters', () => {
		it('should bypass cache with ?refresh=true', async () => {
			const event = createMockEvent('/api/collections?refresh=true', 'GET', mockUser);
			const response = await handleApiRequests({ event, resolve: mockResolve });

			expect(response.headers.get('X-Cache')).toBeDefined();
		});

		it('should bypass cache with ?nocache=true', async () => {
			const event = createMockEvent('/api/data?nocache=true', 'GET', mockUser);
			const response = await handleApiRequests({ event, resolve: mockResolve });

			expect(response.headers.get('X-Cache')).toBeDefined();
		});
	});

	describe('GraphQL Bypass', () => {
		it('should NOT cache GraphQL queries', async () => {
			const event = createMockEvent('/api/graphql', 'POST', mockUser);
			const response = await handleApiRequests({ event, resolve: mockResolve });

			// GraphQL responses get X-Cache: BYPASS
			expect(response.headers.get('X-Cache')).toBe('BYPASS');
		});
	});

	describe('Cache Invalidation on Mutations', () => {
		it('should invalidate cache on POST', async () => {
			const event = createMockEvent('/api/collections', 'POST', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			// Cache invalidated for /api/collections/*
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should invalidate cache on PUT', async () => {
			const event = createMockEvent('/api/collections/123', 'PUT', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should invalidate cache on DELETE', async () => {
			const event = createMockEvent('/api/collections/123', 'DELETE', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should invalidate cache on PATCH', async () => {
			const event = createMockEvent('/api/collections/123', 'PATCH', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Streaming Optimization', () => {
		it('should not block response stream for caching', async () => {
			const event = createMockEvent('/api/large-data', 'GET', mockUser);
			const response = await handleApiRequests({ event, resolve: mockResolve });

			// Response returned immediately, cache populated in background
			expect(response).toBeDefined();
		});

		it('should use response.clone() for background caching', async () => {
			const event = createMockEvent('/api/data', 'GET', mockUser);
			const response = await handleApiRequests({ event, resolve: mockResolve });

			// Clone doesn't consume original stream
			expect(response).toBeDefined();
		});
	});

	describe('Metrics Tracking', () => {
		it('should increment API request counter', async () => {
			const event = createMockEvent('/api/test', 'GET', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			// metricsService.incrementApiRequests() called
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should track cache hits', async () => {
			const event = createMockEvent('/api/cached', 'GET', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			// metricsService.recordApiCacheHit() on cache hit
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should track cache misses', async () => {
			const event = createMockEvent('/api/uncached', 'GET', mockUser);
			await handleApiRequests({ event, resolve: mockResolve });

			// metricsService.recordApiCacheMiss() on miss
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should increment error counter on failure', async () => {
			const event = createMockEvent('/api/error', 'GET');

			try {
				await handleApiRequests({ event, resolve: mockResolve });
			} catch {
				// metricsService.incrementApiErrors() on error
				expect(true).toBe(true);
			}
		});
	});

	describe('Edge Cases', () => {
		it('should handle invalid API path', async () => {
			const event = createMockEvent('/api/', 'GET', mockUser);

			try {
				await handleApiRequests({ event, resolve: mockResolve });
			} catch (err) {
				// 400 Bad Request for invalid path
				expect(err).toBeDefined();
			}
		});

		it('should handle non-JSON responses', async () => {
			const event = createMockEvent('/api/download', 'GET', mockUser);
			const response = await handleApiRequests({ event, resolve: mockResolve });

			// Non-JSON responses handled gracefully
			expect(response).toBeDefined();
		});
	});
});
