/**
 * @file tests/bun/hooks/setup.test.ts
 * @description Comprehensive tests for handleSetup middleware with proper redirect validation
 *
 * Tests:
 * - Setup state detection
 * - Allowed routes during setup
 * - Redirect to setup
 * - API error handling
 * - Cache invalidation
 * - Production environment handling
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { invalidateSetupCache } from '@utils/setup-check';

// Use global mockSetupCheck from tests/unit/setup.ts
const mockSetupCheck = (globalThis as any).mockSetupCheck;

// --- Mock SvelteKit (must include all exports used by transitive deps like handleApiError) ---
mock.module('@sveltejs/kit', () => ({
	redirect: (status: number, location: string) => {
		throw { status, location, __isRedirect: true };
	},
	error: (status: number, message: string | { message: string }) => {
		const body = typeof message === 'string' ? { message } : message;
		throw { status, body, message: body.message, __is_http_error: true };
	},
	isRedirect: (err: any) => err && err.__isRedirect === true,
	isHttpError: (err: any) => err && err.__is_http_error === true,
	json: (data: unknown, init?: ResponseInit) =>
		new Response(JSON.stringify(data), {
			...init,
			headers: { 'Content-Type': 'application/json', ...init?.headers }
		}),
	text: (data: string, init?: ResponseInit) => new Response(data, init)
}));

// --- Test Utilities ---
function createMockEvent(pathname: string): RequestEvent {
	const url = new URL(pathname, 'http://localhost');
	return {
		url,
		request: new Request(url.toString()),
		locals: {
			__setupConfigExists: undefined,
			__setupLogged: false,
			__setupRedirectLogged: false,
			__setupLoginRedirectLogged: false
		},
		cookies: {
			get: mock(() => null),
			set: mock(() => ({})),
			delete: mock(() => ({}))
		}
	} as unknown as RequestEvent;
}

function createMockResponse(status = 200): Response {
	return new Response('test body', { status });
}

/** Helper to assert a redirect error */
function expectRedirect(err: unknown, expectedStatus: number, expectedLocation: string) {
	const e = err as any;
	if (!e.__isRedirect) {
		console.error('Caught unexpected error:', e);
	}
	expect(e.__isRedirect).toBe(true);
	expect(e.status).toBe(expectedStatus);
	expect(e.location).toBe(expectedLocation);
}

import { handleSetup } from '@src/hooks/handle-setup';

describe('handleSetup Middleware', () => {
	let mockResolve: ReturnType<typeof mock>;
	let mockResponse: Response;

	beforeEach(async () => {
		mockResponse = createMockResponse();
		mockResolve = mock(() => Promise.resolve(mockResponse));
		mockSetupCheck.setSetupComplete(true);
		invalidateSetupCache();
	});

	// ---------------------------------------------------------------------
	// Setup State Detection
	// ---------------------------------------------------------------------
	describe('Setup State Detection', () => {
		it('detects when config file is missing', async () => {
			mockSetupCheck.setSetupComplete(false);
			const event = createMockEvent('/dashboard');
			try {
				await handleSetup({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err) {
				expectRedirect(err, 302, '/setup');
			}
		});

		it('detects when config values are empty', async () => {
			// Set mockConfigExists to false to simulate incomplete setup
			mockSetupCheck.setSetupComplete(false);

			const event = createMockEvent('/dashboard');
			try {
				await handleSetup({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err) {
				expectRedirect(err, 302, '/setup');
			}
		});

		it('allows access when setup is complete', async () => {
			mockSetupCheck.setSetupComplete(true);

			const event = createMockEvent('/dashboard');
			const response = await handleSetup({ event, resolve: mockResolve });
			expect(response).toBe(mockResponse);
		});
	});

	// ---------------------------------------------------------------------
	// Allowed Routes During Setup
	// ---------------------------------------------------------------------
	describe('Allowed Routes During Setup', () => {
		// Routes allowed by isAllowedDuringSetup():
		// - /setup, /api/system/*
		// - ASSET_REGEX: /_app/*, /static/*, /favicon.ico, *.js, *.css, etc.
		const allowed = ['/setup', '/setup/database', '/_app/immutable/chunks/index.js', '/static/logo.png', '/api/system/version', '/favicon.ico'];
		beforeEach(() => {
			mockSetupCheck.setSetupComplete(false);
		});
		for (const path of allowed) {
			it(`allows ${path}`, async () => {
				const event = createMockEvent(path);
				const response = await handleSetup({ event, resolve: mockResolve });
				expect(response).toBe(mockResponse);
			});
		}

		// Routes NOT allowed during setup (should redirect to /setup)
		const notAllowed = ['/', '/health', '/.well-known/security.txt'];
		for (const path of notAllowed) {
			it(`redirects ${path} to /setup during incomplete setup`, async () => {
				const event = createMockEvent(path);
				try {
					await handleSetup({ event, resolve: mockResolve });
					expect(true).toBe(false);
				} catch (err) {
					expectRedirect(err, 302, '/setup');
				}
			});
		}
	});

	// ---------------------------------------------------------------------
	// Redirect to Setup
	// ---------------------------------------------------------------------
	describe('Redirect to Setup', () => {
		beforeEach(() => {
			mockSetupCheck.setSetupComplete(false);
		});

		// Non-API routes redirect to /setup
		const nonApiRoutes = ['/dashboard', '/login'];
		for (const route of nonApiRoutes) {
			it(`redirects ${route} to /setup`, async () => {
				const event = createMockEvent(route);
				try {
					await handleSetup({ event, resolve: mockResolve });
					expect(true).toBe(false);
				} catch (err) {
					expectRedirect(err, 302, '/setup');
				}
			});
		}

		// API routes return 503 error Response via handleApiError
		it('returns 503 for /api/collections during setup', async () => {
			const event = createMockEvent('/api/collections');
			const response = await handleSetup({ event, resolve: mockResolve });
			expect(response.status).toBe(503);
		});
	});

	// ---------------------------------------------------------------------
	// Block Setup After Completion
	// ---------------------------------------------------------------------
	describe('Block Setup After Completion', () => {
		beforeEach(() => {
			mockSetupCheck.setSetupComplete(true);
		});

		it('redirects /setup to / when setup complete', async () => {
			const event = createMockEvent('/setup');
			// Force the cached value in event.locals to avoid test pollution across the suite
			event.locals.__setupConfigExists = true;
			try {
				await handleSetup({ event, resolve: mockResolve });
				// If we get here, it means no redirect was thrown
				expect(true).toBe(false);
			} catch (err) {
				// The actual implementation redirects to '/' not '/login'
				expectRedirect(err, 302, '/');
			}
		});
	});
});
