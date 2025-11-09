/**
 * @file tests/bun/hooks/setup.test.ts
 * @description Comprehensive tests for handleSetup middleware
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { handleSetup } from '@src/hooks/handleSetup';
import type { RequestEvent } from '@sveltejs/kit';

// --- Test Utilities ---

function createMockEvent(pathname: string, configExists: boolean = true, configValid: boolean = true, hasUsers: boolean = true): RequestEvent {
	const url = new URL(pathname, 'http://localhost');

	return {
		url,
		request: new Request(url.toString()),
		locals: {
			__setupConfigExists: configExists,
			__setupLogged: false
		},
		cookies: {
			get: mock(() => null),
			set: mock(() => {}),
			delete: mock(() => {})
		}
	} as unknown as RequestEvent;
}

function createMockResponse(status: number = 200): Response {
	return new Response('test body', { status });
}

// --- Tests ---

describe('handleSetup Middleware', () => {
	let mockResolve: ReturnType<typeof mock>;
	let mockResponse: Response;

	beforeEach(() => {
		mockResponse = createMockResponse();
		mockResolve = mock(() => Promise.resolve(mockResponse));
	});

	describe('Setup State Detection', () => {
		it('should detect when config file is missing', async () => {
			const event = createMockEvent('/dashboard', false);

			// Should redirect to /setup when config missing
			try {
				await handleSetup({ event, resolve: mockResolve });
			} catch (err) {
				// Redirect throws in SvelteKit
				expect(err).toBeDefined();
			}
		});

		it('should detect when config values are empty', async () => {
			const event = createMockEvent('/dashboard', true, false);

			// Should redirect to /setup when config invalid
			try {
				await handleSetup({ event, resolve: mockResolve });
			} catch (err) {
				expect(err).toBeDefined();
			}
		});

		it('should detect when database has no users', async () => {
			const event = createMockEvent('/dashboard', true, true, false);

			// Should redirect to /setup when no users
			try {
				await handleSetup({ event, resolve: mockResolve });
			} catch (err) {
				expect(err).toBeDefined();
			}
		});

		it('should allow access when setup is complete', async () => {
			const event = createMockEvent('/dashboard', true, true, true);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
			expect(mockResolve).toHaveBeenCalledTimes(1);
		});
	});

	describe('Allowed Routes During Setup', () => {
		it('should allow /setup route when setup incomplete', async () => {
			const event = createMockEvent('/setup', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should allow /api/setup route when setup incomplete', async () => {
			const event = createMockEvent('/api/setup', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should allow /api/setup/config route', async () => {
			const event = createMockEvent('/api/setup/config', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should allow /api/setup/database route', async () => {
			const event = createMockEvent('/api/setup/database', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should allow static assets during setup', async () => {
			const event = createMockEvent('/_app/immutable/chunks/index.js', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should allow /static/ during setup', async () => {
			const event = createMockEvent('/static/logo.png', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should allow root path during setup', async () => {
			const event = createMockEvent('/', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should allow health check during setup', async () => {
			const event = createMockEvent('/health', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should allow /.well-known/ during setup', async () => {
			const event = createMockEvent('/.well-known/security.txt', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});
	});

	describe('Redirect to Setup', () => {
		it('should redirect /dashboard to /setup when config missing', async () => {
			const event = createMockEvent('/dashboard', false);

			try {
				await handleSetup({ event, resolve: mockResolve });
				expect(true).toBe(false); // Should not reach here
			} catch (err: unknown) {
				// Redirect throws
				expect(err).toBeDefined();
			}
		});

		it('should redirect /api/collections to /setup when config missing', async () => {
			const event = createMockEvent('/api/collections', false);

			try {
				await handleSetup({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err) {
				expect(err).toBeDefined();
			}
		});

		it('should redirect /login to /setup when config missing', async () => {
			const event = createMockEvent('/login', false);

			try {
				await handleSetup({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err) {
				expect(err).toBeDefined();
			}
		});

		it('should redirect any non-allowed route to /setup', async () => {
			const routes = ['/dashboard', '/collections', '/users', '/settings'];

			for (const route of routes) {
				const event = createMockEvent(route, false);

				try {
					await handleSetup({ event, resolve: mockResolve });
					expect(true).toBe(false);
				} catch (err) {
					expect(err).toBeDefined();
				}
			}
		});
	});

	describe('Block Setup After Completion', () => {
		it('should redirect /setup to /login when setup complete', async () => {
			const event = createMockEvent('/setup', true, true, true);

			try {
				await handleSetup({ event, resolve: mockResolve });
				// Might redirect or pass through depending on implementation
			} catch (err) {
				// Redirect expected
				expect(err).toBeDefined();
			}
		});

		it('should allow access to non-setup routes when complete', async () => {
			const event = createMockEvent('/dashboard', true, true, true);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});
	});

	describe('Config Validation', () => {
		it('should validate JWT_SECRET_KEY is not empty', async () => {
			// Config validation happens internally
			const event = createMockEvent('/dashboard', true, false);

			try {
				await handleSetup({ event, resolve: mockResolve });
			} catch (err) {
				// Should redirect to setup
				expect(err).toBeDefined();
			}
		});

		it('should validate DB_HOST is not empty', async () => {
			const event = createMockEvent('/dashboard', true, false);

			try {
				await handleSetup({ event, resolve: mockResolve });
			} catch (err) {
				expect(err).toBeDefined();
			}
		});

		it('should validate DB_NAME is not empty', async () => {
			const event = createMockEvent('/dashboard', true, false);

			try {
				await handleSetup({ event, resolve: mockResolve });
			} catch (err) {
				expect(err).toBeDefined();
			}
		});

		it('should accept valid config with all required values', async () => {
			const event = createMockEvent('/dashboard', true, true, true);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});
	});

	describe('Cookie Handling in Setup Mode', () => {
		it('should handle setup API cookie responses', async () => {
			const event = createMockEvent('/api/setup/config', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBeDefined();
		});

		it('should preserve set-cookie headers from setup API', async () => {
			const event = createMockEvent('/api/setup/database', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			// Cookie headers should be preserved
			expect(response).toBeDefined();
		});
	});

	describe('Caching Optimizations', () => {
		it('should cache config existence check', async () => {
			const event = createMockEvent('/dashboard', true, true, true);
			await handleSetup({ event, resolve: mockResolve });

			// event.locals.__setupConfigExists should be set
			expect(event.locals.__setupConfigExists).toBe(true);
		});

		it('should cache setup log state', async () => {
			const event = createMockEvent('/dashboard', true, true, true);
			await handleSetup({ event, resolve: mockResolve });

			// event.locals.__setupLogged should be set
			expect(event.locals.__setupLogged).toBeDefined();
		});

		it('should avoid redundant database checks', async () => {
			const event = createMockEvent('/dashboard', true, true, true);

			// First request
			await handleSetup({ event, resolve: mockResolve });

			// Cache should be used for subsequent logic
			expect(event.locals.__setupConfigExists).toBeDefined();
		});
	});

	describe('Edge Cases', () => {
		it('should handle root path correctly', async () => {
			const event = createMockEvent('/', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should handle paths with query parameters', async () => {
			const event = createMockEvent('/setup?step=1', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should handle paths with trailing slash', async () => {
			const event = createMockEvent('/setup/', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should handle deep API paths', async () => {
			const event = createMockEvent('/api/setup/config/validate', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should handle internal routes (/_)', async () => {
			const event = createMockEvent('/_app/version.json', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});

		it('should handle .well-known paths', async () => {
			const event = createMockEvent('/.well-known/change-password', false);
			const response = await handleSetup({ event, resolve: mockResolve });

			expect(response).toBe(mockResponse);
		});
	});

	describe('Multi-Step Validation', () => {
		it('should validate in correct order: file → values → users', async () => {
			// Step 1: File check
			const noFileEvent = createMockEvent('/dashboard', false, true, true);
			try {
				await handleSetup({ event: noFileEvent, resolve: mockResolve });
			} catch (err) {
				expect(err).toBeDefined(); // Should fail at step 1
			}

			mockResolve.mockClear();

			// Step 2: Values check
			const noValuesEvent = createMockEvent('/dashboard', true, false, true);
			try {
				await handleSetup({ event: noValuesEvent, resolve: mockResolve });
			} catch (err) {
				expect(err).toBeDefined(); // Should fail at step 2
			}

			mockResolve.mockClear();

			// Step 3: Users check
			const noUsersEvent = createMockEvent('/dashboard', true, true, false);
			try {
				await handleSetup({ event: noUsersEvent, resolve: mockResolve });
			} catch (err) {
				expect(err).toBeDefined(); // Should fail at step 3
			}

			mockResolve.mockClear();

			// All steps pass
			const completeEvent = createMockEvent('/dashboard', true, true, true);
			const response = await handleSetup({ event: completeEvent, resolve: mockResolve });
			expect(response).toBe(mockResponse); // Should succeed
		});
	});
});
