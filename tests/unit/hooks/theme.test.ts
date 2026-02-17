/**
 * @file tests/bun/hooks/theme.test.ts
 * @description Robust, type-safe tests for the handleTheme middleware.
 * Refactored to remove flakiness and ensure strict typing.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Theme } from '@src/databases/dbInterface';
import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';

// --- Mock ThemeManager ---
// We need to mock the ThemeManager singleton to avoid DB calls during tests
const mockGetTheme = mock(() => Promise.resolve(null));
const mockIsInitialized = mock(() => true);

mock.module('@src/databases/themeManager', () => ({
	ThemeManager: {
		getInstance: () => ({
			getTheme: mockGetTheme,
			isInitialized: mockIsInitialized
		})
	}
}));

// --- Type Definitions ---
// Augment the SvelteKit Locals interface for test safety
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace App {
		interface Locals {
			darkMode: boolean;
			theme: Theme | null;
			[key: string]: unknown;
		}
	}
}

// --- Constants ---
const BASE_HTML = '<html lang="en" dir="ltr"><head></head><body>Content</body></html>';
const DARK_CLASS_REGEX = /<html[^>]*class="[^"]*\bdark\b[^"]*"[^>]*>/;

// --- Test Helper ---
function createMockEvent(pathname: string, themeCookie?: string): RequestEvent {
	const url = new URL(pathname, 'http://localhost');

	// Mock RequestEvent with minimal necessary properties
	return {
		url,
		request: new Request(url.toString()),
		cookies: {
			get: (name: string) => (name === 'theme' ? themeCookie : undefined),
			set: mock(() => {}),
			delete: mock(() => {}),
			getAll: () => [],
			serialize: () => ''
		},
		locals: {
			darkMode: false, // Default state
			theme: null,
			tenantId: 'default'
		},
		params: {},
		route: { id: pathname },
		platform: {},
		setHeaders: mock(() => {}),
		fetch: mock(() => Promise.resolve(new Response()))
	} as unknown as RequestEvent;
}

describe('Middleware: handleTheme', () => {
	let mockResolve: any;
	let handleTheme: any;

	beforeEach(async () => {
		// Reset mocks
		mockGetTheme.mockClear();
		mockIsInitialized.mockClear();
		mockIsInitialized.mockReturnValue(true); // Default to initialized

		// Dynamic import to ensure mocks are applied
		const mod = await import('@src/hooks/handleTheme');
		handleTheme = mod.handleTheme;

		// A robust mock of SvelteKit's `resolve` function
		mockResolve = mock(async (_event: RequestEvent, opts?: ResolveOptions) => {
			const transformPageChunk = opts?.transformPageChunk;

			if (transformPageChunk) {
				// Simulate SvelteKit applying the transform during rendering
				const transformedHtml = await transformPageChunk({ html: BASE_HTML, done: true });
				return new Response(transformedHtml, {
					headers: { 'Content-Type': 'text/html' }
				});
			}

			return new Response(BASE_HTML, {
				headers: { 'Content-Type': 'text/html' }
			});
		});
	});

	// --- LOGIC TESTS (Parameterized) ---
	describe('Cookie Detection & Locals', () => {
		const testCases = [
			{ cookie: 'dark', expectedMode: true, desc: 'Dark Mode' },
			{ cookie: 'light', expectedMode: false, desc: 'Light Mode' },
			{ cookie: 'system', expectedMode: false, desc: 'System Mode' },
			{ cookie: undefined, expectedMode: false, desc: 'No Cookie' },
			{ cookie: 'invalid-value', expectedMode: false, desc: 'Invalid Cookie' },
			{ cookie: 'empty-value', expectedMode: false, desc: 'Empty Cookie' }
		];

		for (const { cookie, expectedMode, desc } of testCases) {
			it(`should correctly handle ${desc}`, async () => {
				const event = createMockEvent('/', cookie);
				await handleTheme({ event, resolve: mockResolve });
				expect(event.locals.darkMode).toBe(expectedMode);
			});
		}
	});

	// --- HTML INJECTION TESTS ---
	describe('Server-Side Rendering (SSR) Injection', () => {
		it('should inject "dark" class into HTML when theme is dark', async () => {
			const event = createMockEvent('/', 'dark');
			const response = await handleTheme({ event, resolve: mockResolve });
			const html = await response.text();

			expect(html).toMatch(DARK_CLASS_REGEX);
			expect(html).toContain('class="dark"');
		});

		it('should NOT inject "dark" class when theme is light', async () => {
			const event = createMockEvent('/', 'light');
			const response = await handleTheme({ event, resolve: mockResolve });
			const html = await response.text();

			expect(html).not.toContain('class="dark"');
		});

		it('should NOT inject "dark" class when theme is system (client-side handles it)', async () => {
			const event = createMockEvent('/', 'system');
			const response = await handleTheme({ event, resolve: mockResolve });
			const html = await response.text();

			expect(html).not.toContain('class="dark"');
		});

		it('should preserve HTML structure (avoid double tags)', async () => {
			const event = createMockEvent('/', 'dark');
			const response = await handleTheme({ event, resolve: mockResolve });
			const html = await response.text();

			const htmlTagCount = (html.match(/<html/g) || []).length;
			expect(htmlTagCount).toBe(1);
			expect(html).toContain('lang="en"');
		});
	});

	// --- THEME MANAGER INTEGRATION ---
	describe('Theme Manager Integration', () => {
		it('should attempt to load custom theme when initialized', async () => {
			const event = createMockEvent('/', 'light');
			await handleTheme({ event, resolve: mockResolve });

			expect(mockIsInitialized).toHaveBeenCalled();
			expect(mockGetTheme).toHaveBeenCalled();
		});

		it('should skip theme loading when NOT initialized', async () => {
			mockIsInitialized.mockReturnValue(false);

			const event = createMockEvent('/', 'light');
			await handleTheme({ event, resolve: mockResolve });

			expect(mockIsInitialized).toHaveBeenCalled();
			expect(mockGetTheme).not.toHaveBeenCalled();
			expect(event.locals.theme).toBeNull();
		});

		it('should handle theme loading errors gracefully', async () => {
			mockGetTheme.mockRejectedValue(new Error('DB Error'));

			const event = createMockEvent('/', 'light');
			// Should not throw
			await handleTheme({ event, resolve: mockResolve });

			expect(event.locals.theme).toBeNull();
		});
	});

	// --- EDGE CASES ---
	describe('Edge Cases & Security', () => {
		it('should ignore non-HTML responses (e.g. JSON API)', async () => {
			const event = createMockEvent('/api/data', 'dark');

			// Override resolve to return JSON
			mockResolve = mock(() => Response.json({ data: 1 }));

			const response = await handleTheme({ event, resolve: mockResolve });
			const text = await response.text();

			// Should not try to inject class="dark" into JSON
			expect(text).not.toContain('class="dark"');
			expect(JSON.parse(text)).toEqual({ data: 1 });
		});

		it('should sanitize extremely long cookies', async () => {
			const longCookie = 'dark'.padEnd(1000, 'x');
			const event = createMockEvent('/', longCookie);

			// Should default to false/safe state rather than crashing
			await handleTheme({ event, resolve: mockResolve });
			expect(event.locals.darkMode).toBe(false);
		});

		it('should handle XSS attempts in cookie gracefully', async () => {
			const event = createMockEvent('/', 'dark<script>alert(1)</script>');
			await handleTheme({ event, resolve: mockResolve });

			expect(event.locals.darkMode).toBe(false);
		});
	});
});
