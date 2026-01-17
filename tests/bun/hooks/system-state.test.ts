/**
 * @file tests/bun/hooks/system-state.test.ts
 * @description Tests for handleSystemState middleware - System state gatekeeper
 *
 * Tests the state machine logic that blocks/allows requests based on system operational state:
 * - IDLE: Setup wizard and health checks only
 * - INITIALIZING: Blocks most routes, allows setup/health
 * - READY: All routes allowed
 * - DEGRADED: All routes allowed with warnings
 * - FAILED: Blocks all routes, allows health check only
 */
import { mock, describe, it, beforeEach, expect } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';

// Mock dependencies before importing the hook
const mockGetSystemState = mock(() => ({ overallState: 'READY', services: {}, performanceMetrics: { stateTransitions: [] as any[] } }));
const mockIsSystemReady = mock(() => true);
const mockDbInitPromise = Promise.resolve();

// Mock the system store
mock.module('@shared/stores/system', () => ({
	getSystemState: mockGetSystemState,
	isSystemReady: mockIsSystemReady
}));

// Mock the database initialization
mock.module('@shared/database/db', () => ({
	dbInitPromise: mockDbInitPromise
}));

// Mock logger to prevent console noise
mock.module('@shared/utils/logger.server', () => ({
	logger: {
		debug: mock(() => {}),
		trace: mock(() => {}),
		info: mock(() => {}),
		warn: mock(() => {}),
		fatal: mock(() => {}),
		error: mock(() => {})
	}
}));

// Now import the hook after mocks are set up
import { handleSystemState } from '@cms/hooks/handleSystemState';

/**
 * Helper to create a minimal RequestEvent for testing
 */
function createMockEvent(pathname: string): RequestEvent {
	return {
		url: new URL(`http://localhost${pathname}`),
		request: new Request(`http://localhost${pathname}`),
		params: {},
		route: { id: pathname },
		locals: {},
		cookies: {
			get: () => undefined,
			set: () => {},
			delete: () => {},
			serialize: () => '',
			getAll: () => []
		},
		fetch: global.fetch,
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		isDataRequest: false,
		isSubRequest: false,
		setHeaders: () => {}
	} as unknown as RequestEvent;
}

/**
 * Mock resolve function that returns a Response
 */
const mockResolve = mock(() => {
	return Promise.resolve(new Response('OK', { status: 200 }));
});

describe('handleSystemState - State Machine Logic', () => {
	beforeEach(() => {
		// Reset mocks between tests
		mockGetSystemState.mockClear();
		mockIsSystemReady.mockClear();
		mockResolve.mockClear();
	});

	describe('READY state', () => {
		beforeEach(() => {
			mockGetSystemState.mockReturnValue({
				overallState: 'READY',
				services: {},
				performanceMetrics: { stateTransitions: [] }
			});
			mockIsSystemReady.mockReturnValue(true);
		});

		it('should allow all routes when system is READY', async () => {
			const event = createMockEvent('/dashboard');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
			expect(mockResolve).toHaveBeenCalledWith(event);
		});

		it('should allow API routes when system is READY', async () => {
			const event = createMockEvent('/api/collections/get');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
			expect(mockResolve).toHaveBeenCalledWith(event);
		});

		it('should allow setup routes when system is READY', async () => {
			const event = createMockEvent('/setup/database');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
			expect(mockResolve).toHaveBeenCalledWith(event);
		});
	});

	describe('DEGRADED state', () => {
		beforeEach(() => {
			mockGetSystemState.mockReturnValue({
				overallState: 'DEGRADED',
				services: {
					cache: { status: 'unhealthy', lastCheck: new Date() },
					database: { status: 'healthy', lastCheck: new Date() }
				},
				performanceMetrics: { stateTransitions: [] }
			});
			mockIsSystemReady.mockReturnValue(true);
		});

		it('should allow requests when system is DEGRADED', async () => {
			const event = createMockEvent('/dashboard');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
			expect(mockResolve).toHaveBeenCalledWith(event);
		});

		it('should attach degraded services info to event.locals', async () => {
			const event = createMockEvent('/api/collections');
			await handleSystemState({ event, resolve: mockResolve });

			expect(event.locals.degradedServices).toBeDefined();
			expect(event.locals.degradedServices).toContain('cache');
			expect(event.locals.degradedServices).not.toContain('database');
		});

		it('should allow health checks during DEGRADED state', async () => {
			const event = createMockEvent('/api/system/health');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});
	});

	describe('IDLE state', () => {
		beforeEach(() => {
			mockGetSystemState.mockReturnValue({
				overallState: 'IDLE',
				services: {},
				performanceMetrics: { stateTransitions: [] }
			});
			mockIsSystemReady.mockReturnValue(false);
		});

		it('should allow /setup routes during IDLE state', async () => {
			const event = createMockEvent('/setup');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
			expect(mockResolve).toHaveBeenCalledWith(event);
		});

		it('should allow /api/setup routes during IDLE state', async () => {
			const event = createMockEvent('/api/setup/test-database');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
			expect(mockResolve).toHaveBeenCalledWith(event);
		});

		it('should allow health check routes during IDLE state', async () => {
			const event = createMockEvent('/api/system/health');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should allow static assets during IDLE state', async () => {
			const event = createMockEvent('/static/logo.png');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should allow root path during IDLE state', async () => {
			const event = createMockEvent('/');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should block non-setup routes during IDLE state', async () => {
			const event = createMockEvent('/dashboard');

			try {
				await handleSystemState({ event, resolve: mockResolve });
				expect(true).toBe(false); // Should not reach here
			} catch (err: unknown) {
				const error = err as { status: number; body: { message: string } };
				expect(error.status).toBe(503);
				expect(error.body.message).toContain('system is starting up');
			}
		});

		it('should block API routes (non-setup) during IDLE state', async () => {
			const event = createMockEvent('/api/collections/get');

			try {
				await handleSystemState({ event, resolve: mockResolve });
				expect(true).toBe(false); // Should not reach here
			} catch (err: unknown) {
				const error = err as { status: number };
				expect(error.status).toBe(503);
			}
		});
	});

	describe('INITIALIZING state', () => {
		beforeEach(() => {
			mockGetSystemState.mockReturnValue({
				overallState: 'INITIALIZING',
				services: {},
				performanceMetrics: { stateTransitions: [] }
			});
			mockIsSystemReady.mockReturnValue(false);
		});

		it('should allow setup routes during INITIALIZING', async () => {
			const event = createMockEvent('/setup/database');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should allow health checks during INITIALIZING', async () => {
			const event = createMockEvent('/api/system/health');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should block regular routes during INITIALIZING', async () => {
			const event = createMockEvent('/dashboard');

			try {
				await handleSystemState({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err: unknown) {
				const error = err as { status: number; body: { message: string } };
				expect(error.status).toBe(503);
				expect(error.body.message).toContain('system is starting up');
			}
		});
	});

	describe('FAILED state', () => {
		beforeEach(() => {
			mockGetSystemState.mockReturnValue({
				overallState: 'FAILED',
				services: {
					database: { status: 'unhealthy', lastCheck: new Date(), error: 'Connection timeout' }
				},
				performanceMetrics: {
					stateTransitions: [{ from: 'INITIALIZING', to: 'FAILED', timestamp: Date.now(), reason: 'Database connection failed' }]
				}
			});
			mockIsSystemReady.mockReturnValue(false);
		});

		it('should allow health checks even when FAILED', async () => {
			const event = createMockEvent('/api/system/health');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should allow dashboard health checks when FAILED', async () => {
			const event = createMockEvent('/api/dashboard/health');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should allow well-known routes when FAILED', async () => {
			const event = createMockEvent('/.well-known/security.txt');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should block all other routes when FAILED', async () => {
			const event = createMockEvent('/dashboard');

			try {
				await handleSystemState({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err: unknown) {
				const error = err as { status: number; body: { message: string } };
				expect(error.status).toBe(503);
				expect(error.body.message).toContain('critical system component has failed');
			}
		});

		it('should block setup routes when FAILED', async () => {
			const event = createMockEvent('/setup');

			try {
				await handleSystemState({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err: unknown) {
				const error = err as { status: number };
				expect(error.status).toBe(503);
			}
		});

		it('should block API routes when FAILED', async () => {
			const event = createMockEvent('/api/collections');

			try {
				await handleSystemState({ event, resolve: mockResolve });
				expect(true).toBe(false);
			} catch (err: unknown) {
				const error = err as { status: number };
				expect(error.status).toBe(503);
			}
		});
	});

	describe('Route pattern matching', () => {
		beforeEach(() => {
			mockGetSystemState.mockReturnValue({
				overallState: 'IDLE',
				services: {},
				performanceMetrics: { stateTransitions: [] }
			});
			mockIsSystemReady.mockReturnValue(false);
		});

		it('should allow /login during IDLE state', async () => {
			const event = createMockEvent('/login');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should allow /assets during IDLE state', async () => {
			const event = createMockEvent('/assets/main.js');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should allow /favicon.ico during IDLE state', async () => {
			const event = createMockEvent('/favicon.ico');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});

		it('should allow SvelteKit internal routes (/_) during IDLE state', async () => {
			const event = createMockEvent('/_app/immutable/assets/main.js');
			const response = await handleSystemState({ event, resolve: mockResolve });

			expect(response.status).toBe(200);
		});
	});
});
