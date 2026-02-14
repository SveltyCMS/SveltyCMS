/**
 * @file tests/bun/hooks/setup.test.ts
 * @description Comprehensive tests for handleSetup middleware with proper redirect validation.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';

// --- Mock the setup check module ---
let mockConfigExists = true; // controls isSetupComplete() and isSetupCompleteAsync()
mock.module('@utils/setupCheck', () => ({
	isSetupComplete: () => mockConfigExists,
	isSetupCompleteAsync: async () => mockConfigExists,
	invalidateSetupCache: () => {}
}));

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

// --- Mock node:fs and node:path ---
// We need to mock these BEFORE importing handleSetup
const mockReadFileSync = mock(() => 'JWT_SECRET_KEY: "secret", DB_HOST: "localhost", DB_NAME: "test"');
mock.module('node:fs', () => ({
	readFileSync: mockReadFileSync
}));
mock.module('node:path', () => ({
	join: (...args: string[]) => args.join('/')
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

function createMockResponse(status: number = 200): Response {
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

describe('handleSetup Middleware', () => {
	let mockResolve: ReturnType<typeof mock>;
	let mockResponse: Response;
	let handleSetup: any;

	beforeEach(async () => {
		mockResponse = createMockResponse();
		mockResolve = mock(() => Promise.resolve(mockResponse));
		mockConfigExists = true;
		mockReadFileSync.mockClear();

		// Dynamic import to ensure mocks are applied
		// We use a query param to force re-evaluation if possible, but Bun might not support it for local files easily.
		// However, mock.module updates should be reflected in subsequent imports if the module wasn't fully cached or if Bun's test runner handles it.
		const mod = await import('@src/hooks/handleSetup');
		handleSetup = mod.handleSetup;
	});

	// ---------------------------------------------------------------------
	// Setup State Detection
	// ---------------------------------------------------------------------
	describe('Setup State Detection', () => {
		it('detects when config file is missing', async () => {
			mockConfigExists = false;
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
			mockConfigExists = false;

			const event = createMockEvent('/dashboard');
			try {
				await handleSetup({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err) {
				expectRedirect(err, 302, '/setup');
			}
		});

		it('allows access when setup is complete', async () => {
			// Ensure mock returns valid config
			mockReadFileSync.mockReturnValue('JWT_SECRET_KEY: "secret", DB_HOST: "localhost", DB_NAME: "test"');

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
			mockConfigExists = false;
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
			mockConfigExists = false;
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
			mockConfigExists = true;
		});

		it('redirects /setup to / when setup complete', async () => {
			const event = createMockEvent('/setup');
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
