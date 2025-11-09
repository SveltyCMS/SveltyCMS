/**
 * @file tests/bun/hooks/static-asset-caching.test.ts
 * @description Comprehensive tests for handleStaticAssetCaching middleware
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { handleStaticAssetCaching, isStaticAsset, STATIC_ASSET_REGEX } from '@src/hooks/handleStaticAssetCaching';
import type { RequestEvent } from '@sveltejs/kit';

// --- Test Utilities ---

function createMockEvent(pathname: string): RequestEvent {
	return {
		url: new URL(pathname, 'http://localhost'),
		request: new Request(`http://localhost${pathname}`)
	} as RequestEvent;
}

function createMockResponse(headers: Record<string, string> = {}): Response {
	return new Response('test body', { headers });
}

// --- Tests ---

describe('handleStaticAssetCaching Middleware', () => {
	let mockResolve: ReturnType<typeof mock>;
	let mockResponse: Response;

	beforeEach(() => {
		mockResponse = createMockResponse();
		mockResolve = mock(() => Promise.resolve(mockResponse));
	});

	describe('Static Asset Detection (STATIC_ASSET_REGEX)', () => {
		it('should match /_app/ paths', () => {
			expect('/_app/immutable/chunks/index.js').toMatch(STATIC_ASSET_REGEX);
			expect('/_app/version.json').toMatch(STATIC_ASSET_REGEX);
		});

		it('should match /static/ paths', () => {
			expect('/static/logo.png').toMatch(STATIC_ASSET_REGEX);
			expect('/static/images/banner.jpg').toMatch(STATIC_ASSET_REGEX);
		});

		it('should match /files/ paths', () => {
			expect('/files/document.pdf').toMatch(STATIC_ASSET_REGEX);
			expect('/files/uploads/image.png').toMatch(STATIC_ASSET_REGEX);
		});

		it('should match special files', () => {
			expect('/favicon.ico').toMatch(STATIC_ASSET_REGEX);
			expect('/manifest.webmanifest').toMatch(STATIC_ASSET_REGEX);
			expect('/apple-touch-icon.png').toMatch(STATIC_ASSET_REGEX);
			expect('/apple-touch-icon-precomposed.png').toMatch(STATIC_ASSET_REGEX);
			expect('/robots.txt').toMatch(STATIC_ASSET_REGEX);
			expect('/sitemap.xml').toMatch(STATIC_ASSET_REGEX);
		});

		it('should match JavaScript files', () => {
			expect('/bundle.js').toMatch(STATIC_ASSET_REGEX);
			expect('/app/script.js').toMatch(STATIC_ASSET_REGEX);
		});

		it('should match CSS files', () => {
			expect('/styles.css').toMatch(STATIC_ASSET_REGEX);
			expect('/theme/dark.css').toMatch(STATIC_ASSET_REGEX);
		});

		it('should match source maps', () => {
			expect('/bundle.js.map').toMatch(STATIC_ASSET_REGEX);
			expect('/styles.css.map').toMatch(STATIC_ASSET_REGEX);
		});

		it('should match image files', () => {
			expect('/logo.svg').toMatch(STATIC_ASSET_REGEX);
			expect('/banner.png').toMatch(STATIC_ASSET_REGEX);
			expect('/photo.jpg').toMatch(STATIC_ASSET_REGEX);
			expect('/image.jpeg').toMatch(STATIC_ASSET_REGEX);
			expect('/graphic.gif').toMatch(STATIC_ASSET_REGEX);
			expect('/photo.webp').toMatch(STATIC_ASSET_REGEX);
			expect('/image.avif').toMatch(STATIC_ASSET_REGEX);
		});

		it('should match font files', () => {
			expect('/font.woff').toMatch(STATIC_ASSET_REGEX);
			expect('/font.woff2').toMatch(STATIC_ASSET_REGEX);
			expect('/font.ttf').toMatch(STATIC_ASSET_REGEX);
			expect('/font.eot').toMatch(STATIC_ASSET_REGEX);
		});

		it('should NOT match dynamic routes', () => {
			expect('/').not.toMatch(STATIC_ASSET_REGEX);
			expect('/dashboard').not.toMatch(STATIC_ASSET_REGEX);
			expect('/api/collections').not.toMatch(STATIC_ASSET_REGEX);
			expect('/login').not.toMatch(STATIC_ASSET_REGEX);
		});

		it('should NOT match HTML files', () => {
			expect('/index.html').not.toMatch(STATIC_ASSET_REGEX);
			expect('/about.html').not.toMatch(STATIC_ASSET_REGEX);
		});
	});

	describe('isStaticAsset() Function', () => {
		it('should return true for static asset paths', () => {
			expect(isStaticAsset('/_app/immutable/chunks/index.js')).toBe(true);
			expect(isStaticAsset('/static/logo.png')).toBe(true);
			expect(isStaticAsset('/files/document.pdf')).toBe(true);
			expect(isStaticAsset('/favicon.ico')).toBe(true);
			expect(isStaticAsset('/bundle.js')).toBe(true);
			expect(isStaticAsset('/styles.css')).toBe(true);
		});

		it('should return false for dynamic routes', () => {
			expect(isStaticAsset('/')).toBe(false);
			expect(isStaticAsset('/dashboard')).toBe(false);
			expect(isStaticAsset('/api/collections')).toBe(false);
			expect(isStaticAsset('/login')).toBe(false);
		});

		it('should handle edge cases', () => {
			expect(isStaticAsset('')).toBe(false);
			expect(isStaticAsset('/api/test.js')).toBe(true); // .js extension
			expect(isStaticAsset('/admin/style.css')).toBe(true); // .css extension
		});
	});

	describe('Cache Header Application', () => {
		it('should add aggressive cache headers for static assets', async () => {
			const event = createMockEvent('/_app/immutable/chunks/index.js');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
			expect(mockResolve).toHaveBeenCalledTimes(1);
		});

		it('should cache /static/ assets for 1 year', async () => {
			const event = createMockEvent('/static/logo.png');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should cache /files/ assets for 1 year', async () => {
			const event = createMockEvent('/files/document.pdf');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should cache special files (favicon, manifest)', async () => {
			const faviconEvent = createMockEvent('/favicon.ico');
			const faviconResponse = await handleStaticAssetCaching({ event: faviconEvent, resolve: mockResolve });
			expect(faviconResponse.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

			mockResolve.mockClear();

			const manifestEvent = createMockEvent('/manifest.webmanifest');
			const manifestResponse = await handleStaticAssetCaching({ event: manifestEvent, resolve: mockResolve });
			expect(manifestResponse.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should cache JavaScript files', async () => {
			const event = createMockEvent('/bundle.js');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should cache CSS files', async () => {
			const event = createMockEvent('/styles.css');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should cache image files', async () => {
			const pngEvent = createMockEvent('/logo.png');
			const pngResponse = await handleStaticAssetCaching({ event: pngEvent, resolve: mockResolve });
			expect(pngResponse.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

			mockResolve.mockClear();

			const svgEvent = createMockEvent('/icon.svg');
			const svgResponse = await handleStaticAssetCaching({ event: svgEvent, resolve: mockResolve });
			expect(svgResponse.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should cache font files', async () => {
			const event = createMockEvent('/font.woff2');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});
	});

	describe('Non-Static Asset Passthrough', () => {
		it('should pass through dynamic routes without cache headers', async () => {
			const event = createMockEvent('/dashboard');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
			expect(response.headers.get('Cache-Control')).toBeNull();
			expect(mockResolve).toHaveBeenCalledTimes(1);
		});

		it('should pass through API routes without cache headers', async () => {
			const event = createMockEvent('/api/collections');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
			expect(response.headers.get('Cache-Control')).toBeNull();
		});

		it('should pass through login/auth routes without cache headers', async () => {
			const event = createMockEvent('/login');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
			expect(response.headers.get('Cache-Control')).toBeNull();
		});

		it('should pass through HTML files without cache headers', async () => {
			const event = createMockEvent('/index.html');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
			expect(response.headers.get('Cache-Control')).toBeNull();
		});
	});

	describe('Edge Cases', () => {
		it('should handle root path', async () => {
			const event = createMockEvent('/');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
			expect(response.headers.get('Cache-Control')).toBeNull();
		});

		it('should handle paths with query parameters', async () => {
			const event = createMockEvent('/bundle.js?v=123');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should handle paths with hash fragments', async () => {
			const event = createMockEvent('/styles.css#section');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should preserve existing response headers', async () => {
			const existingHeaders = {
				'Content-Type': 'application/javascript',
				'X-Custom-Header': 'test'
			};
			mockResponse = createMockResponse(existingHeaders);
			mockResolve = mock(() => Promise.resolve(mockResponse));

			const event = createMockEvent('/bundle.js');
			const response = await handleStaticAssetCaching({ event, resolve: mockResolve });

			expect(response.headers.get('Content-Type')).toBe('application/javascript');
			expect(response.headers.get('X-Custom-Header')).toBe('test');
			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});
	});
});
