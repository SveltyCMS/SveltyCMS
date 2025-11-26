// @ts-ignore
/**
 * @file tests/bun/hooks/setup.test.ts
 * @description Comprehensive tests for handleSetup middleware with proper redirect validation.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';

// --- Mock the setup check module ---
let mockConfigExists = true; // controls isSetupComplete()
mock.module('@utils/setupCheck', () => ({
	isSetupComplete: () => mockConfigExists
}));

// --- Mock SvelteKit redirect ---
mock.module('@sveltejs/kit', () => ({
	redirect: (status: number, location: string) => {
		throw { status, location, __isRedirect: true };
	}
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
			// Update mock to return empty config
			mockReadFileSync.mockReturnValue('');

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
		const allowed = [
			'/setup',
			'/api/setup',
			'/api/setup/config',
			'/api/setup/database',
			'/_app/immutable/chunks/index.js',
			'/static/logo.png',
			'/',
			'/health',
			'/.well-known/security.txt'
		];
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
	});

	// ---------------------------------------------------------------------
	// Redirect to Setup
	// ---------------------------------------------------------------------
	describe('Redirect to Setup', () => {
		beforeEach(() => {
			mockConfigExists = false;
		});
		const routes = ['/dashboard', '/api/collections', '/login'];
		for (const route of routes) {
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
	});

	// ---------------------------------------------------------------------
	// Block Setup After Completion
	// ---------------------------------------------------------------------
	describe('Block Setup After Completion', () => {
		beforeEach(() => {
			mockConfigExists = true;
			mockReadFileSync.mockReturnValue('JWT_SECRET_KEY: "secret", DB_HOST: "localhost", DB_NAME: "test"');
		});

		it('redirects /setup to /login when setup complete', async () => {
			const event = createMockEvent('/setup');
			try {
				await handleSetup({ event, resolve: mockResolve });
				// If we get here, it means no redirect was thrown
				console.log('DEBUG: handleSetup did not throw redirect. mockReadFileSync calls:', mockReadFileSync.mock.calls.length);
				expect(true).toBe(false);
			} catch (err) {
				expectRedirect(err, 302, '/login');
			}
		});
	});
});
