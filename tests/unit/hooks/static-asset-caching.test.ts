/**
 * @file tests/bun/hooks/static-asset-caching.test.ts
 * @description Type-safe tests for static asset caching middleware.
 * Verifies aggressive caching policies for immutable assets.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { handleStaticAssetCaching, isStaticAsset, STATIC_ASSET_REGEX } from '@src/hooks/handle-static-asset-caching';
import type { RequestEvent } from '@sveltejs/kit';

// --- Helper: Strictly Typed Mock Event ---
function createMockEvent(pathname: string): RequestEvent {
	const url = new URL(pathname, 'http://localhost');

	// Create a partial mock cast to RequestEvent
	return {
		url,
		request: new Request(url.toString()),
		// Add minimal properties required by SvelteKit internals if needed
		cookies: { get: () => undefined },
		locals: {},
		params: {},
		route: { id: null }
	} as unknown as RequestEvent;
}

describe('Middleware: handleStaticAssetCaching', () => {
	let mockResolve: any;

	beforeEach(() => {
		// strictly typed mock resolve function - create fresh Response each call
		mockResolve = mock(async () => {
			return new Response('test body');
		});
	});

	describe('Regex Validation (STATIC_ASSET_REGEX)', () => {
		const validPaths = [
			'/_app/immutable/chunks/index.js',
			'/_app/version.json',
			'/static/logo.png',
			'/files/document.pdf',
			'/favicon.ico',
			'/manifest.webmanifest',
			'/bundle.js.map',
			'/style.css'
		];

		const invalidPaths = [
			'/',
			'/dashboard',
			'/api/user',
			'/login',
			'/index.html' // HTML should never be cached aggressively
		];

		it('should match all known static paths', () => {
			validPaths.forEach((path) => {
				expect(path).toMatch(STATIC_ASSET_REGEX);
				expect(isStaticAsset(path)).toBe(true);
			});
		});

		it('should NOT match dynamic or HTML paths', () => {
			invalidPaths.forEach((path) => {
				expect(path).not.toMatch(STATIC_ASSET_REGEX);
				expect(isStaticAsset(path)).toBe(false);
			});
		});
	});

	describe('Cache Header Logic', () => {
		it('should apply aggressive caching to static assets', async () => {
			const paths = ['/_app/immutable/entry.js', '/static/hero.jpg', '/files/report.pdf', '/logo.svg'];

			for (const path of paths) {
				mockResolve.mockClear();
				const event = createMockEvent(path);
				const response = await handleStaticAssetCaching({
					event,
					resolve: mockResolve
				});

				expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
			}
		});

		it('should passthrough dynamic routes without headers', async () => {
			const event = createMockEvent('/api/data');
			const response = await handleStaticAssetCaching({
				event,
				resolve: mockResolve
			});

			// We don't check strict equality (toBe) because middleware might wrap/clone response
			// Instead, verify content matches and NO cache headers are added
			const text = await response.text();
			expect(text).toBe('test body');

			if (response.headers.has('Cache-Control')) {
				console.log('DEBUG: Unexpected Cache-Control header:', response.headers.get('Cache-Control'));
			}
			expect(response.headers.has('Cache-Control')).toBe(false);
		});

		it('should preserve existing headers if not static', async () => {
			const customRes = new Response('ok', {
				headers: { 'X-Custom': '123' }
			});
			mockResolve = mock(() => customRes);

			const event = createMockEvent('/dashboard');
			const response = await handleStaticAssetCaching({
				event,
				resolve: mockResolve
			});

			expect(response.headers.get('X-Custom')).toBe('123');
			expect(response.headers.has('Cache-Control')).toBe(false);
		});

		it('should handle query parameters correctly', async () => {
			const event = createMockEvent('/style.css?v=1.0.0');
			const response = await handleStaticAssetCaching({
				event,
				resolve: mockResolve
			});

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});
	});
});
