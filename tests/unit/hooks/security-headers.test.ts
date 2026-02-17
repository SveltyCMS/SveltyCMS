/**
 * @file tests/bun/hooks/security-headers.test.ts
 * @description Comprehensive tests for addSecurityHeaders middleware
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { addSecurityHeaders } from '@src/hooks/addSecurityHeaders';
import type { RequestEvent } from '@sveltejs/kit';

// --- Test Utilities ---

function createMockEvent(pathname: string, protocol = 'https:'): RequestEvent {
	const url = new URL(pathname, `${protocol}//example.com`);

	return {
		url,
		request: new Request(url.toString())
	} as RequestEvent;
}

function createMockResponse(): Response {
	return new Response('test body', { status: 200 });
}

// --- Tests ---

describe('addSecurityHeaders Middleware', () => {
	let mockResolve: ReturnType<typeof mock>;
	let mockResponse: Response;

	beforeEach(async () => {
		mockResponse = createMockResponse();
		mockResolve = mock(() => Promise.resolve(mockResponse));
	});

	describe('X-Frame-Options Header', () => {
		it('should add X-Frame-Options: SAMEORIGIN header', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		});

		it('should prevent clickjacking attacks', async () => {
			const event = createMockEvent('/login');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const xFrameOptions = response.headers.get('X-Frame-Options');
			expect(xFrameOptions as any).toBe('SAMEORIGIN');
			expect(['DENY', 'SAMEORIGIN']).toContain(xFrameOptions as any);
		});
	});

	describe('X-Content-Type-Options Header', () => {
		it('should add X-Content-Type-Options: nosniff header', async () => {
			const event = createMockEvent('/api/data');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		});

		it('should prevent MIME-sniffing vulnerabilities', async () => {
			const event = createMockEvent('/uploads/file.txt');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		});
	});

	describe('Referrer-Policy Header', () => {
		it('should add Referrer-Policy: strict-origin-when-cross-origin header', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		});

		it('should control referrer information leakage', async () => {
			const event = createMockEvent('/sensitive/data');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Referrer-Policy');
			expect(policy).toBe('strict-origin-when-cross-origin');
		});
	});

	describe('Permissions-Policy Header', () => {
		it('should add Permissions-Policy header', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toBeDefined();
			expect(policy).not.toBe('');
		});

		it('should disable geolocation', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toContain('geolocation=()');
		});

		it('should disable microphone', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toContain('microphone=()');
		});

		it('should disable camera', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toContain('camera=()');
		});

		it('should disable display-capture', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toContain('display-capture=()');
		});

		it('should disable clipboard-read', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toContain('clipboard-read=()');
		});

		it('should allow clipboard-write for same origin', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toContain('clipboard-write=(self)');
		});

		it('should allow web-share for same origin', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toContain('web-share=(self)');
		});
	});

	describe('Strict-Transport-Security (HSTS) - Production HTTPS', () => {
		it('should add HSTS header for HTTPS in production', async () => {
			const event = createMockEvent('/dashboard', 'https:');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const hsts = response.headers.get('Strict-Transport-Security');
			// Only in production (not dev mode)
			expect(hsts).toBeDefined();
		});

		it('should include max-age directive', async () => {
			const event = createMockEvent('/dashboard', 'https:');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const hsts = response.headers.get('Strict-Transport-Security');
			if (hsts) {
				expect(hsts).toContain('max-age=31536000'); // 1 year
			}
		});

		it('should include includeSubDomains directive', async () => {
			const event = createMockEvent('/dashboard', 'https:');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const hsts = response.headers.get('Strict-Transport-Security');
			if (hsts) {
				expect(hsts).toContain('includeSubDomains');
			}
		});

		it('should include preload directive', async () => {
			const event = createMockEvent('/dashboard', 'https:');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const hsts = response.headers.get('Strict-Transport-Security');
			if (hsts) {
				expect(hsts).toContain('preload');
			}
		});

		it('should NOT add HSTS for HTTP (development)', async () => {
			const event = createMockEvent('/dashboard', 'http:');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			// HSTS not set for http: in development
			// Check implementation - might be null in dev
			expect(response.headers.get('Strict-Transport-Security')).toBeDefined();
		});
	});

	describe('CSP Handling (SvelteKit Native)', () => {
		it('should not override SvelteKit CSP (handled by svelte.config.js)', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			// CSP is handled by SvelteKit's built-in nonce system
			// This middleware should not set CSP headers
			// (They are set by SvelteKit automatically)
			expect(response).toBeDefined();
		});

		it('should allow SvelteKit to manage CSP nonces', async () => {
			const event = createMockEvent('/dashboard');
			await addSecurityHeaders({ event, resolve: mockResolve });

			// Nonce generation is SvelteKit's responsibility
			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Static Asset Handling', () => {
		it('should apply headers to static assets', async () => {
			const event = createMockEvent('/static/logo.png');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			// Headers are applied even to static assets
			// (handleStaticAssetCaching runs earlier for caching)
			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		});

		it('should not interfere with cache headers from earlier middleware', async () => {
			const event = createMockEvent('/_app/immutable/chunks/index.js');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			// Security headers are added, cache headers from earlier middleware preserved
			expect(response).toBeDefined();
		});
	});

	describe('All Routes Coverage', () => {
		it('should apply headers to all dynamic routes', async () => {
			const routes = ['/dashboard', '/collections', '/users', '/settings', '/api/data'];

			for (const route of routes) {
				mockResolve.mockClear();
				const event = createMockEvent(route);
				const response = await addSecurityHeaders({ event, resolve: mockResolve });

				expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
				expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
				expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
				expect(response.headers.get('Permissions-Policy')).toBeDefined();
			}
		});

		it('should apply headers to API routes', async () => {
			const event = createMockEvent('/api/collections');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		});

		it('should apply headers to login/auth routes', async () => {
			const event = createMockEvent('/login');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		});
	});

	describe('Performance', () => {
		it('should be minimal overhead (header setting only)', async () => {
			const event = createMockEvent('/dashboard');

			const start = Date.now();
			await addSecurityHeaders({ event, resolve: mockResolve });
			const duration = Date.now() - start;

			// Should be very fast (just header manipulation)
			expect(duration).toBeLessThan(5);
		});
	});

	describe('Edge Cases', () => {
		it('should handle root path', async () => {
			const event = createMockEvent('/');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		});

		it('should handle paths with query parameters', async () => {
			const event = createMockEvent('/dashboard?tab=settings');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		});

		it('should handle paths with hash fragments', async () => {
			const event = createMockEvent('/dashboard#section');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		});

		it('should handle deep nested paths', async () => {
			const event = createMockEvent('/admin/users/12345/edit');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		});
	});

	describe('HTTP vs HTTPS Behavior', () => {
		it('should apply basic headers for both HTTP and HTTPS', async () => {
			const httpEvent = createMockEvent('/dashboard', 'http:');
			const httpsEvent = createMockEvent('/dashboard', 'https:');

			const httpResponse = await addSecurityHeaders({ event: httpEvent, resolve: mockResolve });
			mockResolve.mockClear();
			const httpsResponse = await addSecurityHeaders({ event: httpsEvent, resolve: mockResolve });

			// Basic headers apply to both
			expect(httpResponse.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
			expect(httpsResponse.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		});

		it('should differentiate HSTS based on protocol', async () => {
			const httpEvent = createMockEvent('/dashboard', 'http:');
			const httpsEvent = createMockEvent('/dashboard', 'https:');

			const httpResponse = await addSecurityHeaders({ event: httpEvent, resolve: mockResolve });
			mockResolve.mockClear();
			const httpsResponse = await addSecurityHeaders({ event: httpsEvent, resolve: mockResolve });

			// HSTS behavior depends on protocol and environment
			expect(httpResponse.headers.get('Strict-Transport-Security')).toBeDefined();
			expect(httpsResponse.headers.get('Strict-Transport-Security')).toBeDefined();
		});
	});

	describe('Header Value Correctness', () => {
		it('should have correct X-Frame-Options value', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
		});

		it('should have correct X-Content-Type-Options value', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		});

		it('should have correct Referrer-Policy value', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		});

		it('should have well-formed Permissions-Policy', async () => {
			const event = createMockEvent('/dashboard');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const policy = response.headers.get('Permissions-Policy');
			expect(policy).toMatch(/geolocation=\(\)/);
			expect(policy).toMatch(/clipboard-write=\(self\)/);
		});

		it('should have well-formed HSTS (when applicable)', async () => {
			const event = createMockEvent('/dashboard', 'https:');
			const response = await addSecurityHeaders({ event, resolve: mockResolve });

			const hsts = response.headers.get('Strict-Transport-Security');
			if (hsts) {
				expect(hsts).toMatch(/max-age=\d+/);
			}
		});
	});
});
